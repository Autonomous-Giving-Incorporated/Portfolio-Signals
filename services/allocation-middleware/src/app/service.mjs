import { normalizeEveryOrgDonation } from '../connectors/everyorg.mjs';
import { csvRowToEveryOrgPayload, parseGiftCsv } from '../connectors/csv.mjs';
import { extractOptInContact } from '../connectors/contact.mjs';
import { creditGift, availableCents } from '../domain/pots.mjs';
import { approveAllocation } from '../domain/allocate.mjs';
import { parseAmount, formatCents } from '../domain/money.mjs';
import { setLabel, listLabels, mergePots, applyAliases } from '../domain/mapping.mjs';
import { createMemoryStore, ensureExtras } from './store-core.mjs';
import { normalizeDonationLink, publicDonationLink } from './donation-link.mjs';
import {
  buildImpactNoticeRecord,
  contactsForAllocation,
  createNoopNotifier,
  deliverImpactNotice,
  evaluateImpactNotice,
} from './impact-notice.mjs';
import { maybeSignalFromVerifiedGift } from '../intel/gift-signal.mjs';

const DEFAULT_LIMITS = Object.freeze({
  maxGifts: 100_000,
  maxPots: 10_000,
  maxAllocations: 100_000,
  maxExceptions: 10_000,
  maxProofs: 100_000,
  maxKeyLength: 128,
});

/** Seed/fixture chargeIds must not count as live every.org connect. */
export function isFixtureChargeId(id) {
  return /^fixture[-_]/i.test(String(id || ''));
}

function giftSummary(gift) {
  if (!gift) return null;
  return {
    chargeId: gift.chargeId,
    campaignKey: gift.campaignKey,
    programKey: gift.programKey,
    netCents: gift.netCents.toString(),
    donatedAt: gift.donatedAt,
    source: gift.source,
    fixture: isFixtureChargeId(gift.chargeId),
  };
}

export function createService({
  orgId,
  now = () => new Date().toISOString(),
  idgen = () => crypto.randomUUID(),
  noticeIdgen = () => crypto.randomUUID(),
  store = createMemoryStore(),
  proofSlaHours = 72,
  limits: configuredLimits = {},
  notifier = createNoopNotifier(),
  intel = null,
  resolveNeedForGift = null,
}) {
  const limits = { ...DEFAULT_LIMITS, ...configuredLimits };
  let mutationQueue = Promise.resolve();

  async function withState(fn) {
    const run = mutationQueue.then(async () => {
      const state = ensureExtras(await store.load());
      const result = fn(state);
      if (result && result.state) {
        await store.save(ensureExtras(result.state));
      }
      return result;
    });
    mutationQueue = run.catch(() => {});
    return run;
  }

  function requireBounded(value, maximum, code) {
    if (String(value ?? '').length > maximum) throw new Error(code);
  }

  function mapKeys(state, campaignKey, programKey) {
    return applyAliases(orgId, campaignKey, programKey, state);
  }

  async function issueNoticeBestEffort({ allocationId, evidenceId, proofWaived }) {
    try {
      const state = ensureExtras(await store.load());
      const allocation = state.allocations.get(allocationId);
      const existing = (state.impactNotices || new Map()).get(allocationId);
      const decision = evaluateImpactNotice({
        allocation,
        donationLink: state.donationLink,
        contacts: allocation ? contactsForAllocation(state, allocation) : [],
        existingNotice: existing,
        evidenceId,
        proofWaived,
      });
      if (!decision.issue) {
        return { issued: false, reason: decision.reason, notice: decision.notice || null, deliveries: [] };
      }
      const notice = buildImpactNoticeRecord({
        id: noticeIdgen(),
        orgId,
        allocationId,
        evidenceId,
        proofWaived,
        channel: decision.channel,
        donationLink: decision.donationLink,
        useSummary: decision.useSummary,
        chargeId: decision.contact.chargeId,
        createdAt: now(),
      });
      let deliveries = [];
      try {
        deliveries = await deliverImpactNotice({
          notice,
          contact: decision.contact,
          notifier,
          idgen: noticeIdgen,
          now,
        });
      } catch {
        deliveries = [{
          id: noticeIdgen(),
          noticeId: notice.impactNoticeId,
          orgId,
          channel: decision.channel,
          status: 'failed',
          attemptedAt: now(),
          detail: 'delivery_failed',
        }];
      }
      await withState((current) => {
        if ((current.impactNotices || new Map()).has(allocationId)) {
          return { state: current };
        }
        const impactNotices = new Map(current.impactNotices || []);
        impactNotices.set(allocationId, notice);
        return {
          state: {
            ...current,
            impactNotices,
            impactDeliveries: [...(current.impactDeliveries || []), ...deliveries],
          },
        };
      });
      return { issued: true, reason: null, notice, deliveries };
    } catch {
      return { issued: false, reason: 'issue_failed', notice: null, deliveries: [] };
    }
  }

  function persistNormalizedGift(state, payload, { source } = {}) {
    let gift = normalizeEveryOrgDonation(payload, { orgId });
    const mapped = mapKeys(state, gift.campaignKey, gift.programKey);
    gift = { ...gift, ...mapped };
    if (source) gift = { ...gift, source };
    requireBounded(gift.chargeId, 256, 'CHARGE_ID_TOO_LONG');
    requireBounded(gift.campaignKey, limits.maxKeyLength, 'CAMPAIGN_KEY_TOO_LONG');
    requireBounded(gift.programKey, limits.maxKeyLength, 'PROGRAM_KEY_TOO_LONG');
    requireBounded(gift.currency, 16, 'CURRENCY_TOO_LONG');
    const credited = creditGift(state, gift, limits);
    const contact = extractOptInContact(payload);
    if (!contact || !credited.created) return { ...credited, gift };
    const giftContacts = new Map(credited.state.giftContacts || []);
    giftContacts.set(gift.chargeId, { chargeId: gift.chargeId, ...contact });
    return { ...credited, gift, state: { ...credited.state, giftContacts } };
  }

  return {
    async maybeRecordGiftSignal(gift, { source, verified } = {}) {
      if (!intel || !gift) return { created: false, reason: 'INTEL_NOT_ATTACHED' };
      const needId = typeof resolveNeedForGift === 'function' ? resolveNeedForGift(gift) : null;
      return maybeSignalFromVerifiedGift(intel, {
        gift,
        needId,
        verified,
        source: source || gift.source,
        capturedAt: now(),
      });
    },
    async ingestEveryOrg(payload, options = {}) {
      const credited = await withState((state) => persistNormalizedGift(state, payload, options));
      if (credited.created && credited.gift) {
        await this.maybeRecordGiftSignal(credited.gift, { source: credited.gift.source, verified: true });
      }
      return credited;
    },
    async importCsv(text) {
      const rows = parseGiftCsv(text);
      const createdGifts = [];
      let created = 0;
      await withState((state) => {
        let s = state;
        for (const row of rows) {
          const payload = csvRowToEveryOrgPayload(row, { donatedAtFallback: now() });
          const r = persistNormalizedGift(s, payload, { source: 'csv' });
          s = r.state;
          if (r.created) {
            created += 1;
            if (r.gift) createdGifts.push(r.gift);
          }
        }
        return { state: s };
      });
      for (const gift of createdGifts) {
        await this.maybeRecordGiftSignal(gift, { source: 'csv', verified: true });
      }
      return { created, total: rows.length };
    },
    async listAvailable() {
      const state = ensureExtras(await store.load());
      const labels = state.labels || new Map();
      return [...state.pots.values()]
        .filter((p) => p.orgId === orgId)
        .map((p) => ({
          campaignKey: p.campaignKey,
          programKey: p.programKey,
          campaignLabel:
            labels.get(`${orgId}|campaign|${p.campaignKey}`) || p.campaignKey,
          programLabel:
            labels.get(`${orgId}|program|${p.programKey}`) || p.programKey,
          credited: formatCents(p.creditedCents),
          allocated: formatCents(p.allocatedCents),
          available: formatCents(
            availableCents(state, orgId, p.campaignKey, p.programKey),
          ),
        }));
    },
    async allocate({ campaignKey, programKey, amount, purpose, approvedBy, id: requestedId }) {
      const amountCents = parseAmount(amount).cents;
      const id =
        requestedId && /^alloc_[a-z0-9_]+$/.test(requestedId) ? requestedId : idgen();
      const approvedAt = now();
      await withState((state) => {
        if (!state.allocations.has(id) && state.allocations.size >= limits.maxAllocations) {
          throw new Error('STATE_ALLOCATION_LIMIT');
        }
        const mapped = mapKeys(state, campaignKey, programKey);
        return approveAllocation(state, {
          id,
          orgId,
          campaignKey: mapped.campaignKey,
          programKey: mapped.programKey,
          amountCents,
          purpose,
          approvedBy,
          approvedAt,
        });
      });
      const state = await store.load();
      return state.allocations.get(id);
    },
    async setLabel(input) {
      requireBounded(input.key, limits.maxKeyLength, 'LABEL_KEY_TOO_LONG');
      requireBounded(input.label, 256, 'LABEL_TOO_LONG');
      await withState((state) => setLabel(state, { orgId, ...input }));
      return { ok: true };
    },
    async listLabels() {
      const state = ensureExtras(await store.load());
      return listLabels(state, orgId);
    },
    async mergePots(input) {
      await withState((state) => mergePots(state, { orgId, ...input }));
      return { ok: true };
    },
    async setDonationLink(value) {
      const donationLink = normalizeDonationLink(value);
      await withState((state) => ({ state: { ...state, donationLink } }));
      return { donationLink };
    },
    async getDonationLink() {
      const state = ensureExtras(await store.load());
      return publicDonationLink(state.donationLink);
    },
    async attachProof({ allocationId, uri, note, attachedBy }) {
      if (!uri || !String(uri).trim()) throw new Error('PROOF_URI_REQUIRED');
      const proof = {
        id: idgen(),
        allocationId,
        uri: String(uri).trim(),
        note: note || '',
        attachedBy: attachedBy || '',
        attachedAt: now(),
      };
      await withState((state) => {
        if (!state.allocations.has(allocationId)) throw new Error('ALLOCATION_NOT_FOUND');
        const proofs = new Map(state.proofs || []);
        const proofCount = [...proofs.values()].reduce((count, rows) => count + rows.length, 0);
        if (proofCount >= limits.maxProofs) throw new Error('STATE_PROOF_LIMIT');
        const list = proofs.get(allocationId) || [];
        list.push(proof);
        proofs.set(allocationId, list);
        const exceptions = state.exceptions.map((e) =>
          e.code === 'MISSING_PROOF' && e.ref?.allocationId === allocationId
            ? { ...e, open: false }
            : e,
        );
        return { state: { ...state, proofs, exceptions } };
      });
      const impactNotice = await issueNoticeBestEffort({
        allocationId,
        evidenceId: proof.id,
        proofWaived: false,
      });
      return { ok: true, proof, impactNotice };
    },
    async waiveProof({ allocationId, note, waivedBy }) {
      if (!allocationId) throw new Error('ALLOCATION_NOT_FOUND');
      const waiver = {
        allocationId,
        waivedBy: waivedBy || '',
        waivedAt: now(),
        note: note || '',
      };
      if (!String(waiver.waivedBy).trim()) throw new Error('WAIVE_ACTOR_REQUIRED');
      await withState((state) => {
        if (!state.allocations.has(allocationId)) throw new Error('ALLOCATION_NOT_FOUND');
        const proofWaivers = new Map(state.proofWaivers || []);
        if (!proofWaivers.has(allocationId)) proofWaivers.set(allocationId, waiver);
        const exceptions = state.exceptions.map((e) =>
          e.code === 'MISSING_PROOF' && e.ref?.allocationId === allocationId
            ? { ...e, open: false }
            : e,
        );
        return { state: { ...state, proofWaivers, exceptions } };
      });
      const impactNotice = await issueNoticeBestEffort({
        allocationId,
        evidenceId: null,
        proofWaived: true,
      });
      return { ok: true, waiver, impactNotice };
    },
    async listImpactNotices() {
      const state = ensureExtras(await store.load());
      return [...(state.impactNotices || new Map()).values()].filter((n) => n.orgId === orgId);
    },
    async listImpactDeliveries() {
      const state = ensureExtras(await store.load());
      const noticeIds = new Set(
        [...(state.impactNotices || new Map()).values()]
          .filter((n) => n.orgId === orgId)
          .map((n) => n.impactNoticeId),
      );
      return (state.impactDeliveries || []).filter((d) => noticeIds.has(d.noticeId));
    },
    async listExceptions({ openOnly = true } = {}) {
      const state = ensureExtras(await store.load());
      const base = [...(state.exceptions || [])];
      const slaMs = proofSlaHours * 3600 * 1000;
      const nowMs = Date.parse(now());
      for (const a of state.allocations.values()) {
        if (a.orgId !== orgId) continue;
        const proofs = (state.proofs && state.proofs.get(a.id)) || [];
        if (proofs.length > 0) continue;
        const age = nowMs - Date.parse(a.approvedAt);
        if (Number.isFinite(age) && age > slaMs) {
          const exists = base.some(
            (e) => e.code === 'MISSING_PROOF' && e.ref?.allocationId === a.id && e.open,
          );
          if (!exists) {
            base.push({
              id: `ex_proof_${a.id}`,
              orgId,
              code: 'MISSING_PROOF',
              message: `Allocation ${a.id} has no proof after ${proofSlaHours}h`,
              open: true,
              createdAt: now(),
              ref: { allocationId: a.id },
            });
          }
        }
      }
      return base.filter((e) => e.orgId === orgId && (!openOnly || e.open));
    },
    async resolveException(id) {
      await withState((state) => ({
        state: {
          ...state,
          exceptions: state.exceptions.map((e) =>
            e.id === id ? { ...e, open: false } : e,
          ),
        },
      }));
    },
    async getTrail() {
      const state = ensureExtras(await store.load());
      return {
        gifts: [...state.gifts.values()].filter((g) => g.orgId === orgId),
        allocations: [...state.allocations.values()].filter((a) => a.orgId === orgId),
        pots: [...state.pots.values()].filter((p) => p.orgId === orgId),
        proofs: Object.fromEntries(
          [...(state.proofs || new Map()).entries()].filter(([allocId]) => {
            const a = state.allocations.get(allocId);
            return a && a.orgId === orgId;
          }),
        ),
        donationLink: publicDonationLink(state.donationLink),
        impactNotices: [...(state.impactNotices || new Map()).values()].filter((n) => n.orgId === orgId),
        impactDeliveries: (state.impactDeliveries || []).filter((d) => d.orgId === orgId),
        proofWaivers: [...(state.proofWaivers || new Map()).values()],
      };
    },
    async getPacket() {
      const pots = await this.listAvailable();
      const state = ensureExtras(await store.load());
      const allocations = [...state.allocations.values()].filter((a) => a.orgId === orgId);
      let credited = 0n;
      let allocated = 0n;
      for (const p of state.pots.values()) {
        if (p.orgId !== orgId) continue;
        credited += p.creditedCents;
        allocated += p.allocatedCents;
      }
      return {
        generatedAt: now(),
        orgId,
        pots,
        allocations: allocations.map((a) => ({
          id: a.id,
          campaignKey: a.campaignKey,
          programKey: a.programKey,
          amount: formatCents(a.amountCents),
          purpose: a.purpose,
          approvedAt: a.approvedAt,
          proofCount: ((state.proofs && state.proofs.get(a.id)) || []).length,
        })),
        totals: {
          credited: formatCents(credited),
          allocated: formatCents(allocated),
          available: formatCents(credited - allocated),
        },
        donationLink: publicDonationLink(state.donationLink),
      };
    },
    async health() {
      const state = ensureExtras(await store.load());
      return {
        ok: true,
        orgId,
        pots: state.pots.size,
        gifts: state.gifts.size,
        allocations: state.allocations.size,
        openExceptions: (await this.listExceptions({ openOnly: true })).length,
      };
    },
    /**
     * Setup wizard status for every.org connect flow.
     * @param {{ webhookUrl?: string, hasWebhookToken?: boolean, hasOperatorToken?: boolean }} meta
     */
    async getSetupStatus(meta = {}) {
      const state = ensureExtras(await store.load());
      const gifts = [...state.gifts.values()].filter((g) => g.orgId === orgId);
      const pots = [...state.pots.values()].filter((p) => p.orgId === orgId);
      const allocations = [...state.allocations.values()].filter((a) => a.orgId === orgId);
      const byDonatedDesc = (a, b) => String(b.donatedAt).localeCompare(String(a.donatedAt));
      const fixtureGifts = gifts.filter((g) => isFixtureChargeId(g.chargeId));
      const liveGifts = gifts.filter((g) => !isFixtureChargeId(g.chargeId));
      const lastGift = gifts.slice().sort(byDonatedDesc)[0];
      const lastLiveGift = liveGifts.slice().sort(byDonatedDesc)[0];
      const receivedLive = liveGifts.length > 0;
      const steps = {
        copyWebhookUrl: Boolean(meta.webhookUrl),
        pasteInEveryOrg: Boolean(meta.webhookUrl), // operator confirms; we can't see every.org admin
        receivedFixtureGifts: fixtureGifts.length > 0,
        // API name kept for clients; meaning is live (non-fixture) gift only
        receivedTestGift: receivedLive,
        receivedLiveGift: receivedLive,
        hasAvailableBalance: pots.some((p) => p.creditedCents > p.allocatedCents),
        firstAllocation: allocations.length > 0,
      };
      return {
        orgId,
        connector: 'every.org',
        authModel: 'webhook_url', // not OAuth
        donationLink: publicDonationLink(state.donationLink),
        webhookUrl: meta.webhookUrl || null,
        hasWebhookToken: Boolean(meta.hasWebhookToken),
        hasOperatorToken: Boolean(meta.hasOperatorToken),
        steps,
        counts: {
          gifts: gifts.length,
          fixtureGifts: fixtureGifts.length,
          liveGifts: liveGifts.length,
          pots: pots.length,
          allocations: allocations.length,
        },
        lastGift: giftSummary(lastGift),
        lastLiveGift: giftSummary(lastLiveGift),
        instructions: [
          {
            id: 1,
            title: 'Copy your webhook URL',
            detail: 'Use the URL shown in this wizard (includes a secret token).',
          },
          {
            id: 2,
            title: 'Open every.org nonprofit settings',
            detail: 'Go to every.org/<your-slug>/admin/settings → Advanced settings.',
          },
          {
            id: 3,
            title: 'Paste the webhook URL',
            detail: 'Save. every.org will POST each completed donation to AGI.',
          },
          {
            id: 4,
            title: 'Send a small live test gift',
            detail:
              'Donate $1 on your nonprofit page. Seed/fixture gifts do not count as Connected.',
          },
          {
            id: 5,
            title: 'Confirm live gift landed',
            detail:
              'Status becomes Connected when a non-fixture chargeId is received. Then allocate.',
          },
        ],
      };
    },
  };
}
