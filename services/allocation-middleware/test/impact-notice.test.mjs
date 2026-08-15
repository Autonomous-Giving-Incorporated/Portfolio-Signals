import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createService } from '../src/app/service.mjs';
import { createMemoryStore } from '../src/app/store-core.mjs';

function giftPayload(overrides = {}) {
  return {
    chargeId: 'chg-notice-1',
    amount: '50.00',
    netAmount: '50.00',
    currency: 'USD',
    donationDate: '2026-08-01T00:00:00Z',
    designation: 'Lab',
    fromFundraiser: { title: 'Spring', slug: 'spring' },
    toNonprofit: { slug: 'x', name: 'X' },
    ...overrides,
  };
}

async function fundedService(options = {}) {
  let n = 0;
  const emails = [];
  const svc = createService({
    orgId: 'org_1',
    store: options.store || createMemoryStore(),
    now: () => '2026-08-15T12:00:00Z',
    idgen: () => `id_${++n}`,
    noticeIdgen: () => `notice_${n}`,
    notifier: options.notifier || {
      emailConfigured: false,
      async sendEmail(msg) {
        emails.push(msg);
        return { ok: true };
      },
    },
  });
  await svc.ingestEveryOrg(giftPayload(options.gift || {}));
  if (options.donationLink !== undefined) {
    await svc.setDonationLink(options.donationLink);
  }
  const alloc = await svc.allocate({
    campaignKey: 'spring',
    programKey: 'lab',
    amount: '10.00',
    purpose: 'Kitchen renovation materials for the community lab.',
    approvedBy: 'director@example.org',
  });
  return { svc, alloc, emails };
}

test('allocate-only does not issue ImpactNotice', async () => {
  const { svc, alloc } = await fundedService({
    donationLink: 'https://www.every.org/hacker-dojo',
    gift: { email: 'donor@example.org', donorId: 'donor_1' },
  });
  assert.equal((await svc.listImpactNotices()).length, 0);
  const trail = await svc.getTrail();
  assert.equal(trail.allocations.some((row) => row.id === alloc.id), true);
  assert.equal(trail.impactNotices.length, 0);
});

test('proof without contact does not issue ImpactNotice', async () => {
  const { svc, alloc } = await fundedService({
    donationLink: 'https://www.every.org/hacker-dojo',
  });
  const result = await svc.attachProof({
    allocationId: alloc.id,
    uri: 'https://example.com/evidence/receipt.pdf',
    attachedBy: 'director@example.org',
  });
  assert.equal(result.ok, true);
  assert.equal(result.impactNotice.issued, false);
  assert.equal(result.impactNotice.reason, 'no_contact');
  assert.equal((await svc.listImpactNotices()).length, 0);
});

test('proof without donation_link does not issue ImpactNotice', async () => {
  const { svc, alloc } = await fundedService({
    gift: { email: 'donor@example.org', donorId: 'donor_1' },
  });
  const result = await svc.attachProof({
    allocationId: alloc.id,
    uri: 'https://example.com/evidence/receipt.pdf',
    attachedBy: 'director@example.org',
  });
  assert.equal(result.ok, true);
  assert.equal(result.impactNotice.issued, false);
  assert.equal(result.impactNotice.reason, 'no_donation_link');
  assert.equal((await svc.listImpactNotices()).length, 0);
  assert.equal((await svc.getPacket()).donationLink, null);
});

test('proof with contact and donation_link issues one ImpactNotice', async () => {
  const { svc, alloc } = await fundedService({
    donationLink: 'https://www.every.org/hacker-dojo',
    gift: { email: 'donor@example.org', donorId: 'donor_1' },
  });
  const result = await svc.attachProof({
    allocationId: alloc.id,
    uri: 'https://example.com/evidence/receipt.pdf',
    attachedBy: 'director@example.org',
  });
  assert.equal(result.impactNotice.issued, true);
  const notice = result.impactNotice.notice;
  assert.equal(notice.allocationId, alloc.id);
  assert.equal(notice.donationLink, 'https://www.every.org/hacker-dojo');
  assert.equal(notice.proofWaived, false);
  assert.equal(notice.useSummary, 'Kitchen renovation materials for the community lab.');
  assert.equal('email' in notice, false);
  const deliveries = result.impactNotice.deliveries;
  assert.equal(deliveries.some((d) => d.channel === 'in_app' && d.status === 'sent'), true);
  assert.equal(deliveries.some((d) => d.channel === 'email' && d.status === 'skipped'), true);
});

test('duplicate proof does not double-send', async () => {
  const { svc, alloc } = await fundedService({
    donationLink: 'https://www.every.org/hacker-dojo',
    gift: { email: 'donor@example.org', donorId: 'donor_1' },
  });
  const first = await svc.attachProof({
    allocationId: alloc.id,
    uri: 'https://example.com/evidence/receipt-1.pdf',
    attachedBy: 'director@example.org',
  });
  const second = await svc.attachProof({
    allocationId: alloc.id,
    uri: 'https://example.com/evidence/receipt-2.pdf',
    attachedBy: 'director@example.org',
  });
  assert.equal(first.impactNotice.issued, true);
  assert.equal(second.impactNotice.issued, false);
  assert.equal(second.impactNotice.reason, 'already_issued');
  assert.equal((await svc.listImpactNotices()).length, 1);
  assert.equal((await svc.listImpactDeliveries()).length, first.impactNotice.deliveries.length);
});

test('explicit waive can issue ImpactNotice; send failure does not roll back waive', async () => {
  const { svc, alloc } = await fundedService({
    donationLink: 'https://www.every.org/hacker-dojo',
    gift: { email: 'donor@example.org' },
    notifier: {
      emailConfigured: true,
      async sendEmail() {
        return { ok: false, reason: 'email_send_failed' };
      },
    },
  });
  const result = await svc.waiveProof({
    allocationId: alloc.id,
    note: 'Receipt lost; board waived.',
    waivedBy: 'director@example.org',
  });
  assert.equal(result.ok, true);
  assert.equal(result.impactNotice.issued, true);
  assert.equal(result.impactNotice.notice.proofWaived, true);
  assert.equal(result.impactNotice.deliveries.some((d) => d.channel === 'email' && d.status === 'failed'), true);
  const trail = await svc.getTrail();
  assert.equal(trail.proofWaivers.length, 1);
  assert.equal(trail.allocations.length, 1);
});

test('email sends only when Resend is configured and connector supplied email', async () => {
  const sent = [];
  const { svc, alloc } = await fundedService({
    donationLink: 'https://www.every.org/hacker-dojo',
    gift: { email: 'donor@example.org', donorId: 'donor_1' },
    notifier: {
      emailConfigured: true,
      async sendEmail(msg) {
        sent.push(msg);
        return { ok: true };
      },
    },
  });
  await svc.attachProof({
    allocationId: alloc.id,
    uri: 'https://example.com/evidence/receipt.pdf',
    attachedBy: 'director@example.org',
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'donor@example.org');
  assert.match(sent[0].text, /https:\/\/www\.every\.org\/hacker-dojo/);
});
