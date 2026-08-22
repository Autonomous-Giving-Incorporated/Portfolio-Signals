import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../src/app/service.mjs';
import { createMemoryStore } from '../src/app/store.mjs';
import { seedFromFixture } from '../src/app/seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, '../../../fixtures/autogive-v1/middleware/pilot.json');

test('synthetic v1 happy path uses public allocation id and fixture source', async () => {
  const store = createMemoryStore();
  const svc = createService({
    orgId: 'org_synthetic_civic_forge',
    store,
    now: () => '2026-08-21T12:00:00Z',
  });
  const result = await seedFromFixture(svc, fixture, { applySuggestedAllocation: true });
  assert.equal(result.orgId, 'org_synthetic_civic_forge');
  assert.equal(result.giftsCreated, 434);
  assert.equal(result.allocationId, 'alloc_community_hardware');
  assert.equal(result.proofAttached, true);
  const hw = result.available.find((p) => p.programKey === 'community-hardware-fund');
  assert.ok(hw);
  assert.equal(hw.allocated, '72000.00');
  const state = await store.load();
  const gift = [...state.gifts.values()][0];
  assert.equal(gift.source, 'fixture');
  assert.match(gift.chargeId, /^fixture-gift_syn_/);
});

test('synthetic v1 duplicate charge is idempotent', async () => {
  const store = createMemoryStore();
  const svc = createService({ orgId: 'org_synthetic_civic_forge', store });
  const first = await seedFromFixture(svc, fixture, { applySuggestedAllocation: false });
  const second = await seedFromFixture(svc, fixture, { applySuggestedAllocation: false });
  assert.equal(first.giftsCreated, 434);
  assert.equal(second.giftsCreated, 0);
});

test('synthetic v1 restricted pot rejects overallocation', async () => {
  const store = createMemoryStore();
  const svc = createService({ orgId: 'org_synthetic_civic_forge', store });
  await seedFromFixture(svc, fixture, { applySuggestedAllocation: true });
  await assert.rejects(
    () =>
      svc.allocate({
        campaignKey: 'cmp_synthetic_builder_fund_2026',
        programKey: 'community-hardware-fund',
        amount: '20000.00',
        purpose: 'Synthetic over-allocation',
        approvedBy: 'director@example.test',
      }),
    /OVER_ALLOCATION/,
  );
});
