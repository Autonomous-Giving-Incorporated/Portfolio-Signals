import { normalizeEveryOrgDonation } from '../connectors/everyorg.mjs';
import { parseGiftCsv } from '../connectors/csv.mjs';
import { emptyState, creditGift, availableCents, resolvePotPath } from '../domain/pots.mjs';
import { approveAllocation } from '../domain/allocate.mjs';
import { parseAmount, formatCents } from '../domain/money.mjs';
import { createMemoryStore } from './store.mjs';

export function createService({
  orgId,
  now = () => new Date().toISOString(),
  idgen = () => crypto.randomUUID(),
  store = createMemoryStore(),
  proofSlaHours = 72,
}) {
  async function withState(fn) {
    let state = await store.load();
    if (!state.proofs) state = { ...state, proofs: new Map() };
    const result = fn(state);
    if (result && result.state) {
      await store.save(result.state);
      return result;
    }
    return result;
  }

  return {
    async ingestEveryOrg(payload) {
      const gift = normalizeEveryOrgDonation(payload, { orgId });
      return withState((state) => creditGift(state, gift));
    },
    async importCsv(text) {
      const rows = parseGiftCsv(text);
      let created = 0;
      await withState((state) => {
        let s = state;
        for (const row of rows) {
          const { campaignKey, programKey } = resolvePotPath({
            fundraiserKey: row.campaignKey,
            designationKey: row.programKey,
          });
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
      const state = await store.load();
      return [...state.pots.values()]
        .filter((p) => p.orgId === orgId)
        .map((p) => ({
          campaignKey: p.campaignKey,
          programKey: p.programKey,
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
      await withState((state) =>
        approveAllocation(state, {
          id,
          orgId,
          campaignKey,
          programKey,
          amountCents,
          purpose,
          approvedBy,
          approvedAt,
        }),
      );
      const state = await store.load();
      return state.allocations.get(id);
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
        // close MISSING_PROOF exceptions for this allocation
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
      const state = await store.load();
      const base = [...(state.exceptions || [])];
      // generate MISSING_PROOF for allocations past SLA without proof
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
      const state = await store.load();
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
      const state = await store.load();
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
  };
}
