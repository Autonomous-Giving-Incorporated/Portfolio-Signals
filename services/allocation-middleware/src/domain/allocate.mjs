import { addCents } from './money.mjs';
import { availableCents } from './pots.mjs';

function potId(orgId, campaignKey, programKey) {
  return `${orgId}|${campaignKey}|${programKey}`;
}

export function approveAllocation(state, input) {
  const avail = availableCents(
    state,
    input.orgId,
    input.campaignKey,
    input.programKey,
  );
  if (input.amountCents <= 0n) throw new Error('INVALID_AMOUNT');
  if (input.amountCents > avail) throw new Error('OVER_ALLOCATION');
  if (state.allocations.has(input.id)) throw new Error('DUPLICATE_ALLOCATION');

  const pots = new Map(state.pots);
  const id = potId(input.orgId, input.campaignKey, input.programKey);
  const pot = pots.get(id);
  if (!pot) throw new Error('POT_NOT_FOUND');
  pots.set(id, {
    ...pot,
    allocatedCents: addCents(pot.allocatedCents, input.amountCents),
  });
  const allocations = new Map(state.allocations);
  allocations.set(input.id, {
    id: input.id,
    orgId: input.orgId,
    campaignKey: input.campaignKey,
    programKey: input.programKey,
    amountCents: input.amountCents,
    purpose: input.purpose,
    status: 'approved',
    approvedAt: input.approvedAt,
    approvedBy: input.approvedBy,
  });
  return { state: { ...state, pots, allocations } };
}
