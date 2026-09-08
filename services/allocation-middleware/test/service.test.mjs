import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createService } from '../src/app/service.mjs';

test('ingest every.org then allocate and build packet', async () => {
  let n = 0;
  const svc = createService({
    orgId: 'org_1',
    now: () => '2026-08-03T12:00:00Z',
    idgen: () => `id_${++n}`,
  });
  const r = await svc.ingestEveryOrg({
    chargeId: 'chg-9',
    amount: '100.00',
    netAmount: '100.00',
    currency: 'USD',
    donationDate: '2026-08-01T00:00:00Z',
    designation: 'Lab',
    fromFundraiser: { title: 'Spring', slug: 'spring' },
    toNonprofit: { slug: 'x', name: 'X' },
  });
  assert.equal(r.created, true);
  const avail = await svc.listAvailable();
  assert.ok(avail.some((p) => p.programKey === 'lab' && p.available === '100.00'));
  const alloc = await svc.allocate({
    campaignKey: 'spring',
    programKey: 'lab',
    amount: '40.00',
    purpose: 'Equipment',
    approvedBy: 'director@example.org',
  });
  assert.equal(alloc.status, 'approved');
  const packet = await svc.getPacket();
  assert.equal(packet.totals.available, '60.00');
  assert.equal(packet.allocations.length, 1);
});

test('attachProof and missing proof exception after SLA', async () => {
  let n = 0;
  let t = Date.parse('2026-08-01T00:00:00Z');
  const svc = createService({
    orgId: 'org_1',
    now: () => new Date(t).toISOString(),
    idgen: () => `id_${++n}`,
    proofSlaHours: 1,
  });
  await svc.ingestEveryOrg({
    chargeId: 'c-proof',
    amount: '50.00',
    netAmount: '50.00',
    currency: 'USD',
    donationDate: '2026-08-01T00:00:00Z',
    toNonprofit: { slug: 'x', name: 'X' },
  });
  const alloc = await svc.allocate({
    campaignKey: 'general',
    programKey: 'undesignated',
    amount: '10.00',
    purpose: 'Test',
    approvedBy: 'd@example.org',
  });
  t += 2 * 3600 * 1000; // 2h later
  const ex = await svc.listExceptions();
  assert.ok(ex.some((e) => e.code === 'MISSING_PROOF' && e.ref.allocationId === alloc.id));
  await svc.attachProof({
    allocationId: alloc.id,
    uri: 'https://evidence.example/photo.jpg',
    attachedBy: 'd@example.org',
  });
  const trail = await svc.getTrail();
  assert.equal(trail.proofs[alloc.id].length, 1);
});

test('state cardinality limits reject new gifts and deduplicate invalid-currency exceptions', async () => {
  const svc = createService({
    orgId: 'org_1',
    limits: { maxGifts: 1, maxPots: 2, maxExceptions: 1, maxKeyLength: 32 },
  });
  const gift = (chargeId, currency = 'USD') => ({
    chargeId, amount: '1.00', netAmount: '1.00', currency,
    donationDate: '2026-08-03T00:00:00Z', toNonprofit: { slug: 'x', name: 'X' },
  });
  await svc.ingestEveryOrg(gift('one'));
  await assert.rejects(() => svc.ingestEveryOrg(gift('two')), /STATE_GIFT_LIMIT/);

  const invalid = createService({
    orgId: 'org_1', limits: { maxGifts: 2, maxPots: 2, maxExceptions: 1, maxKeyLength: 32 },
  });
  await invalid.ingestEveryOrg(gift('bad', 'EUR'));
  await invalid.ingestEveryOrg(gift('bad', 'EUR'));
  assert.equal((await invalid.listExceptions()).length, 1);
});

test('mutations are serialized to prevent lost updates', async () => {
  let state;
  let active = 0;
  let maxActive = 0;
  const base = (await import('../src/domain/pots.mjs')).emptyState();
  const store = {
    async load() { return state || base; },
    async save(next) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      state = next;
      active -= 1;
    },
  };
  const svc = createService({ orgId: 'org_1', store });
  const payload = (id) => ({
    chargeId: id, amount: '1.00', netAmount: '1.00', currency: 'USD',
    donationDate: '2026-08-03T00:00:00Z', toNonprofit: { slug: 'x', name: 'X' },
  });
  await Promise.all([svc.ingestEveryOrg(payload('a')), svc.ingestEveryOrg(payload('b'))]);
  assert.equal(maxActive, 1);
  assert.equal((await svc.getTrail()).gifts.length, 2);
});
