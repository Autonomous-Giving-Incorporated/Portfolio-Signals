import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyState, creditGift, availableCents } from '../src/domain/pots.mjs';
import { approveAllocation } from '../src/domain/allocate.mjs';

function fundedState() {
  let state = emptyState();
  ({ state } = creditGift(state, {
    chargeId: 'c1',
    orgId: 'org_1',
    campaignKey: 'general',
    programKey: 'undesignated',
    netCents: 50000n,
    grossCents: 50000n,
    currency: 'USD',
    donatedAt: '2026-08-03T00:00:00Z',
    source: 'every.org',
  }));
  return state;
}

test('approveAllocation reserves available funds', () => {
  let state = fundedState();
  ({ state } = approveAllocation(state, {
    id: 'alloc_1',
    orgId: 'org_1',
    campaignKey: 'general',
    programKey: 'undesignated',
    amountCents: 20000n,
    purpose: 'Laptops',
    approvedBy: 'director@example.org',
    approvedAt: '2026-08-03T12:00:00Z',
  }));
  assert.equal(availableCents(state, 'org_1', 'general', 'undesignated'), 30000n);
  assert.equal(state.allocations.get('alloc_1').status, 'approved');
});

test('approveAllocation blocks over-allocation', () => {
  const state = fundedState();
  assert.throws(
    () =>
      approveAllocation(state, {
        id: 'alloc_2',
        orgId: 'org_1',
        campaignKey: 'general',
        programKey: 'undesignated',
        amountCents: 999999n,
        purpose: 'Nope',
        approvedBy: 'director@example.org',
        approvedAt: '2026-08-03T12:00:00Z',
      }),
    /OVER_ALLOCATION/,
  );
});
