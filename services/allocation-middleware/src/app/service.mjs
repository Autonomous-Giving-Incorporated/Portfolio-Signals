import { normalizeEveryOrgDonation } from '../connectors/everyorg.mjs';
import { parseGiftCsv } from '../connectors/csv.mjs';
import { emptyState, creditGift, availableCents, resolvePotPath } from '../domain/pots.mjs';
import { approveAllocation } from '../domain/allocate.mjs';
import { parseAmount, formatCents } from '../domain/money.mjs';

export function createService({
  orgId,
  now = () => new Date().toISOString(),
  idgen = () => crypto.randomUUID(),
}) {
  let state = emptyState();

  function creditFromGift(gift) {
    const result = creditGift(state, gift);
    state = result.state;
    return result;
  }

  return {
    ingestEveryOrg(payload) {
      const gift = normalizeEveryOrgDonation(payload, { orgId });
      return creditFromGift(gift);
    },
    importCsv(text) {
      const rows = parseGiftCsv(text);
      let created = 0;
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
        const r = creditFromGift(gift);
        if (r.created) created += 1;
      }
      return { created, total: rows.length };
    },
    listAvailable() {
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
    allocate({ campaignKey, programKey, amount, purpose, approvedBy }) {
      const amountCents = parseAmount(amount).cents;
      const id = idgen();
      const result = approveAllocation(state, {
        id,
        orgId,
        campaignKey,
        programKey,
        amountCents,
        purpose,
        approvedBy,
        approvedAt: now(),
      });
      state = result.state;
      return state.allocations.get(id);
    },
    listExceptions({ openOnly = true } = {}) {
      return state.exceptions.filter((e) => e.orgId === orgId && (!openOnly || e.open));
    },
    resolveException(id) {
      state = {
        ...state,
        exceptions: state.exceptions.map((e) =>
          e.id === id ? { ...e, open: false } : e,
        ),
      };
    },
    getTrail() {
      return {
        gifts: [...state.gifts.values()].filter((g) => g.orgId === orgId),
        allocations: [...state.allocations.values()].filter((a) => a.orgId === orgId),
        pots: [...state.pots.values()].filter((p) => p.orgId === orgId),
      };
    },
    getPacket() {
      const pots = this.listAvailable();
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
