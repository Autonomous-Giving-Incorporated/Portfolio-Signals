import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../src/app/service.mjs';
import { createMemoryStore } from '../src/app/store.mjs';
import { seedFromFixture } from '../src/app/seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, '../fixtures/hacker-dojo-pilot.json');

test('hacker dojo fixture seeds pots and suggested allocation', async () => {
  const store = createMemoryStore();
  const svc = createService({
    orgId: 'org_hacker_dojo',
    store,
    idgen: () => 'alloc_community_hardware_runtime',
    now: () => '2026-08-03T12:00:00Z',
  });
  const result = await seedFromFixture(svc, fixture, { applySuggestedAllocation: true });
  assert.equal(result.giftsCreated, 4);
  assert.ok(result.available.some((p) => p.programKey === 'community-hardware-fund'));
  // 10000+5000+2500 = 17500 hardware, minus 2500 alloc = 15000 available on hardware
  const hw = result.available.find((p) => p.programKey === 'community-hardware-fund');
  assert.equal(hw.credited, '17500.00');
  assert.equal(hw.allocated, '2500.00');
  assert.equal(hw.available, '15000.00');
  assert.equal(result.packet.totals.credited, '19000.00'); // +1500 undesignated
  assert.ok(result.allocationId);
  assert.equal(result.proofAttached, true);
});

test('seed is idempotent on chargeIds', async () => {
  const store = createMemoryStore();
  const svc = createService({ orgId: 'org_hacker_dojo', store, idgen: () => 'x' });
  const r1 = await seedFromFixture(svc, fixture, { applySuggestedAllocation: false });
  const r2 = await seedFromFixture(svc, fixture, { applySuggestedAllocation: false });
  assert.equal(r1.giftsCreated, 4);
  assert.equal(r2.giftsCreated, 0);
});
