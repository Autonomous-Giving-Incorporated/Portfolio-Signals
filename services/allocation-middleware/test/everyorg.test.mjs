import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeEveryOrgDonation } from '../src/connectors/everyorg.mjs';

const sample = {
  chargeId: 'somerandomuuid',
  designation: 'Laptops',
  toNonprofit: { slug: 'community-ai-lab', name: 'Community AI Lab' },
  amount: '1000.00',
  netAmount: '970.07',
  currency: 'USD',
  frequency: 'One-time',
  donationDate: '2022-02-03T05:00:16.175Z',
  fromFundraiser: {
    id: 'fr_1',
    title: 'Hardware Drive',
    slug: 'hardware-drive',
  },
  firstName: 'Jane',
  email: 'jane@example.org',
};

test('normalizeEveryOrgDonation maps fundraiser and designation', () => {
  const g = normalizeEveryOrgDonation(sample, { orgId: 'org_1' });
  assert.equal(g.chargeId, 'somerandomuuid');
  assert.equal(g.orgId, 'org_1');
  assert.equal(g.campaignKey, 'hardware drive');
  assert.equal(g.programKey, 'laptops');
  assert.equal(g.netCents, 97007n);
  assert.equal(g.grossCents, 100000n);
  assert.equal(g.currency, 'USD');
  assert.equal(g.source, 'every.org');
  assert.equal('email' in g, false);
});

test('defaults General and Undesignated', () => {
  const g = normalizeEveryOrgDonation(
    {
      chargeId: 'c2',
      amount: '10.00',
      netAmount: '10.00',
      currency: 'USD',
      donationDate: '2026-01-01T00:00:00Z',
      toNonprofit: { slug: 'x', name: 'X' },
    },
    { orgId: 'org_1' },
  );
  assert.equal(g.campaignKey, 'general');
  assert.equal(g.programKey, 'undesignated');
});
