import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolvePotPath, creditGift, availableCents, emptyState } from '../src/domain/pots.mjs';

test('resolvePotPath uses General and Undesignated defaults', () => {
  assert.deepEqual(resolvePotPath({}), {
    campaignKey: 'general',
    programKey: 'undesignated',
  });
  assert.deepEqual(
    resolvePotPath({ fundraiserKey: 'Hardware Drive', designationKey: 'Laptops' }),
    { campaignKey: 'hardware drive', programKey: 'laptops' },
  );
});

test('creditGift is idempotent on chargeId', () => {
  let state = emptyState();
  const gift = {
    chargeId: 'chg-1',
    orgId: 'org_1',
    campaignKey: 'hardware drive',
    programKey: 'laptops',
    netCents: 97007n,
    grossCents: 100000n,
    currency: 'USD',
    donatedAt: '2026-08-03T00:00:00Z',
    source: 'every.org',
  };
  const r1 = creditGift(state, gift);
  assert.equal(r1.created, true);
  const r2 = creditGift(r1.state, gift);
  assert.equal(r2.created, false);
  assert.equal(availableCents(r2.state, 'org_1', 'hardware drive', 'laptops'), 97007n);
});
