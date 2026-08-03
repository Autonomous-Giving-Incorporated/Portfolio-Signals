import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createService } from '../src/app/service.mjs';

test('ingest every.org then allocate and build packet', () => {
  let n = 0;
  const svc = createService({
    orgId: 'org_1',
    now: () => '2026-08-03T12:00:00Z',
    idgen: () => `id_${++n}`,
  });
  const r = svc.ingestEveryOrg({
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
  const avail = svc.listAvailable();
  assert.ok(avail.some((p) => p.programKey === 'lab' && p.available === '100.00'));
  const alloc = svc.allocate({
    campaignKey: 'spring',
    programKey: 'lab',
    amount: '40.00',
    purpose: 'Equipment',
    approvedBy: 'director@example.org',
  });
  assert.equal(alloc.status, 'approved');
  const packet = svc.getPacket();
  assert.equal(packet.totals.available, '60.00');
  assert.equal(packet.allocations.length, 1);
});
