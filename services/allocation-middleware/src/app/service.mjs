import { normalizeEveryOrgDonation } from '../connectors/everyorg.mjs';
import { parseGiftCsv } from '../connectors/csv.mjs';
import { emptyState, creditGift, availableCents, resolvePotPath } from '../domain/pots.mjs';
import { approveAllocation } from '../domain/allocate.mjs';
import { parseAmount, formatCents } from '../domain/money.mjs';
import { setLabel, listLabels, mergePots, applyAliases } from '../domain/mapping.mjs';
import { createMemoryStore, ensureExtras } from './store.mjs';

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
  store = createMemoryStore(),
  proofSlaHours = 72,
}) {
  async function withState(fn) {
    let state = ensureExtras(await store.load());
    const result = fn(state);
    if (result && result.state) {
      await store.save(ensureExtras(result.state));
      return result;
    }
    return result;
  }

  function mapKeys(state, campaignKey, programKey) {
    return applyAliases(orgId, campaignKey, programKey, state);
  }

  return {
    async ingestEveryOrg(payload) {
      return withState((state) => {
        let gift = normalizeEveryOrgDonation(payload, { orgId });
        const mapped = mapKeys(state, gift.campaignKey, gift.programKey);
        gift = { ...gift, ...mapped };
        return creditGift(state, gift);
      });
    },
    async importCsv(text) {
      const rows = parseGiftCsv(text);
      let created = 0;
      await withState((state) => {
        let s = state;
        for (const row of rows) {
          let { campaignKey, programKey } = resolvePotPath({
            fundraiserKey: row.campaignKey,
            designationKey: row.programKey,
          });
          ({ campaignKey, programKey } = mapKeys(s, campaignKey, programKey));
          const net = parseAmount(row.netAmount);
          const gross = parseAmount(row.amount || row.netAmount);
          const gift = {
            chargeId: row.chargeId,
            orgId,
            campaignKey,
            programKey,
            netCents: net.cents,
            grossCents: gross.cents,
            currency: row.currency || 'USD',
            donatedAt: row.donatedAt || now(),
            source: 'csv',
          };
          const r = creditGift(s, gift);
          s = r.state;
          if (r.created) created += 1;
        }
        return { state: s };
      });
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
    async allocate({ campaignKey, programKey, amount, purpose, approvedBy }) {
      const amountCents = parseAmount(amount).cents;
      const id = idgen();
      const approvedAt = now();
      await withState((state) => {
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
    async attachProof({ allocationId, uri, note, attachedBy }) {
      if (!uri || !String(uri).trim()) throw new Error('PROOF_URI_REQUIRED');
      await withState((state) => {
        if (!state.allocations.has(allocationId)) throw new Error('ALLOCATION_NOT_FOUND');
        const proofs = new Map(state.proofs || []);
        const list = proofs.get(allocationId) || [];
        list.push({
          id: idgen(),
          allocationId,
          uri: String(uri).trim(),
          note: note || '',
          attachedBy: attachedBy || '',
          attachedAt: now(),
        });
        proofs.set(allocationId, list);
        const exceptions = state.exceptions.map((e) =>
          e.code === 'MISSING_PROOF' && e.ref?.allocationId === allocationId
            ? { ...e, open: false }
            : e,
        );
        return { state: { ...state, proofs, exceptions } };
      });
      return { ok: true };
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
