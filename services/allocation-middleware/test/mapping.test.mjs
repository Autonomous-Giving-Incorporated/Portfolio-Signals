import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createService } from '../src/app/service.mjs';

test('merge pots and apply labels', async () => {
  const svc = createService({ orgId: 'org_1', idgen: () => 'm1' });
  await svc.ingestEveryOrg({
    chargeId: 'g1',
    amount: '20.00',
    netAmount: '20.00',
    currency: 'USD',
    donationDate: '2026-08-01T00:00:00Z',
    designation: 'Old Name',
    fromFundraiser: { title: 'Spring', slug: 'spring' },
    toNonprofit: { slug: 'x', name: 'X' },
  });
  await svc.mergePots({
    fromCampaign: 'spring',
    fromProgram: 'old name',
    toCampaign: 'spring',
    toProgram: 'lab',
  });
  const avail = await svc.listAvailable();
  assert.ok(avail.some((p) => p.programKey === 'lab' && p.available === '20.00'));
  assert.ok(!avail.some((p) => p.programKey === 'old name'));
  await svc.setLabel({ kind: 'program', key: 'lab', label: 'Community Lab' });
  const labeled = await svc.listAvailable();
  const lab = labeled.find((p) => p.programKey === 'lab');
  assert.equal(lab.programLabel, 'Community Lab');
});
