import { addCents, subCents } from './money.mjs';

export function emptyState() {
  return {
    gifts: new Map(),
    pots: new Map(),
    allocations: new Map(),
    exceptions: [],
  };
}

export function normalizeKey(s) {
  if (s == null || String(s).trim() === '') return '';
  return String(s).trim().toLowerCase();
}

export function resolvePotPath({ fundraiserKey, designationKey } = {}) {
  const campaignKey = normalizeKey(fundraiserKey) || 'general';
  const programKey = normalizeKey(designationKey) || 'undesignated';
  return { campaignKey, programKey };
}

function potId(orgId, campaignKey, programKey) {
  return `${orgId}|${campaignKey}|${programKey}`;
}

export function availableCents(state, orgId, campaignKey, programKey) {
  const p = state.pots.get(potId(orgId, campaignKey, programKey));
  if (!p) return 0n;
  return subCents(p.creditedCents, p.allocatedCents);
}

export function creditGift(state, gift) {
  if (state.gifts.has(gift.chargeId)) {
    return { state, created: false };
  }
  if (gift.currency !== 'USD') {
    const ex = {
      id: `ex_${gift.chargeId}_currency`,
      orgId: gift.orgId,
      code: 'CURRENCY_MISMATCH',
      message: `currency ${gift.currency} not USD`,
      open: true,
      createdAt: new Date().toISOString(),
      ref: { chargeId: gift.chargeId },
    };
    return {
      state: {
        ...state,
        exceptions: [...state.exceptions, ex],
      },
      created: false,
      exception: ex,
    };
  }
  const gifts = new Map(state.gifts);
  gifts.set(gift.chargeId, gift);
  const pots = new Map(state.pots);
  const id = potId(gift.orgId, gift.campaignKey, gift.programKey);
  const prev = pots.get(id) || {
    orgId: gift.orgId,
    campaignKey: gift.campaignKey,
    programKey: gift.programKey,
    creditedCents: 0n,
    allocatedCents: 0n,
  };
  pots.set(id, {
    ...prev,
    creditedCents: addCents(prev.creditedCents, gift.netCents),
  });
  return { state: { ...state, gifts, pots }, created: true };
}
