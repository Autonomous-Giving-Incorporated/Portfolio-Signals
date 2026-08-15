import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createService } from '../src/app/service.mjs';
import {
  createFundIntel,
  maybeSignalFromVerifiedGift,
  STALENESS_POLICY,
} from '../src/intel/index.mjs';

const NEED = 'need-community-ai-lab';
const NOW = '2026-08-15T16:00:00Z';

function intel(overrides = {}) {
  return createFundIntel({
    now: () => NOW,
    ...overrides,
  });
}

async function happySignal(fi, extra = {}) {
  await fi.registerNeed({ needId: NEED });
  return fi.publishSignal({
    needId: NEED,
    source: extra.source || 'operator-note',
    subject: extra.subject || 'neighborhood-ai-lab-equipment-gap',
    observedAt: extra.observedAt || '2026-08-03T15:50:00Z',
    capturedAt: extra.capturedAt || '2026-08-03T15:50:00Z',
    confidence: extra.confidence ?? 0.92,
    verified: extra.verified,
    ...extra.publish,
  });
}

test('happy path Signal → Opportunity → Recommendation retains EVENT-001–003 payloads', async () => {
  const fi = intel();
  const signal = await happySignal(fi);
  assert.match(signal.signalId, /^[0-9a-f-]{36}$/i);
  assert.equal(signal.needId, NEED);
  assert.equal(signal.subject, 'neighborhood-ai-lab-equipment-gap');
  assert.equal(signal.confidence, 0.92);

  const opportunity = await fi.createOpportunity({
    needId: NEED,
    title: 'Laptop access',
    signalIds: [signal.signalId],
  });
  assert.equal(opportunity.status, 'open');
  assert.deepEqual(opportunity.signalIds, [signal.signalId]);

  const { recommendation, opportunity: converted } = await fi.publishRecommendation({
    opportunityId: opportunity.opportunityId,
    proposedAmount: 2500,
    currency: 'USD',
    rationale: 'Equip the lab from retained survey and operator notes',
  });
  assert.equal(converted.status, 'converted');
  assert.equal(recommendation.opportunityId, opportunity.opportunityId);
  assert.equal(recommendation.proposedAmount, 2500);
  assert.ok(recommendation.rationale.length > 0);

  const events = await fi.listEvents();
  assert.deepEqual(
    events.map((e) => e.eventType),
    ['SignalDetected', 'OpportunityCreated', 'RecommendationGenerated'],
  );
  assert.equal(events[0].payload.signalId, signal.signalId);
  assert.equal(events[1].payload.opportunityId, opportunity.opportunityId);
  assert.equal(events[2].payload.recommendationId, recommendation.recommendationId);
});

test('Recommendation does not change pot available', async () => {
  const fi = intel();
  const svc = createService({
    orgId: 'org_1',
    now: () => NOW,
    intel: fi,
    resolveNeedForGift: () => NEED,
  });
  await fi.registerNeed({ needId: NEED });
  const credited = await svc.ingestEveryOrg({
    chargeId: 'chg-intel-1',
    amount: '100.00',
    netAmount: '100.00',
    currency: 'USD',
    donationDate: '2026-08-10T00:00:00Z',
    designation: 'Lab',
    fromFundraiser: { title: 'Spring', slug: 'spring' },
    toNonprofit: { slug: 'x', name: 'X' },
  });
  assert.equal(credited.created, true);
  const before = await svc.listAvailable();
  const pot = before.find((p) => p.programKey === 'lab');
  assert.equal(pot.available, '100.00');

  const signals = await fi.listSignals();
  assert.equal(signals.length, 1);
  assert.equal(signals[0].source, 'every.org');
  assert.equal(signals[0].subject, 'spring/lab');

  const opportunity = await fi.createOpportunity({
    needId: NEED,
    title: 'Lab equipment',
    signalIds: [signals[0].signalId],
  });
  await fi.publishRecommendation({
    opportunityId: opportunity.opportunityId,
    proposedAmount: 40,
    currency: 'USD',
    rationale: 'Propose a slice of observed spring/lab gifts; advisory only',
  });

  const after = await svc.listAvailable();
  assert.equal(after.find((p) => p.programKey === 'lab').available, '100.00');
  const trail = await svc.getTrail();
  assert.equal(trail.allocations.length, 0);
  assert.equal(trail.gifts.length, 1);
});

test('duplicate or correction is a new signalId; prior Signal is immutable', async () => {
  const fi = intel();
  const first = await happySignal(fi);
  const second = await fi.publishSignal({
    needId: NEED,
    source: 'operator-note',
    subject: 'neighborhood-ai-lab-equipment-gap',
    observedAt: '2026-08-03T15:50:00Z',
    confidence: 0.92,
  });
  assert.notEqual(second.signalId, first.signalId);
  assert.equal((await fi.listSignals()).length, 2);
  await assert.rejects(
    () =>
      fi.publishSignal({
        signalId: first.signalId,
        needId: NEED,
        source: 'operator-note',
        subject: 'rewritten-subject',
        observedAt: '2026-08-04T00:00:00Z',
        confidence: 0.1,
      }),
    (err) => err.code === 'SIGNAL_IMMUTABLE',
  );
  assert.equal((await fi.getSignal(first.signalId)).subject, 'neighborhood-ai-lab-equipment-gap');
});

test('missing Need cannot publish a Signal', async () => {
  const fi = intel();
  await assert.rejects(
    () =>
      fi.publishSignal({
        source: 'operator-note',
        subject: 'neighborhood-ai-lab-equipment-gap',
        observedAt: NOW,
        confidence: 0.5,
      }),
    (err) => err.code === 'NEED_REQUIRED',
  );
  await assert.rejects(
    () =>
      fi.publishSignal({
        needId: NEED,
        source: 'operator-note',
        subject: 'neighborhood-ai-lab-equipment-gap',
        observedAt: NOW,
        confidence: 0.5,
      }),
    (err) => err.code === 'NEED_NOT_REGISTERED',
  );
  assert.equal((await fi.listSignals()).length, 0);
});

test('unverified connector input and Stripe do not create Signals', async () => {
  const fi = intel();
  await fi.registerNeed({ needId: NEED });
  await assert.rejects(
    () =>
      fi.publishSignal({
        needId: NEED,
        source: 'every.org',
        subject: 'spring/lab',
        observedAt: NOW,
        confidence: 0.8,
        verified: false,
      }),
    (err) => err.code === 'UNVERIFIED_CONNECTOR',
  );
  await assert.rejects(
    () =>
      fi.publishSignal({
        needId: NEED,
        source: 'csv',
        subject: 'spring/lab',
        observedAt: NOW,
        confidence: 0.8,
      }),
    (err) => err.code === 'UNVERIFIED_CONNECTOR',
  );
  await assert.rejects(
    () =>
      fi.publishSignal({
        needId: NEED,
        source: 'stripe',
        subject: 'billing-invoice',
        observedAt: NOW,
        confidence: 1,
        verified: true,
      }),
    (err) => err.code === 'STRIPE_FORBIDDEN',
  );

  const gift = {
    chargeId: 'ch_stripe',
    campaignKey: 'spring',
    programKey: 'lab',
    donatedAt: NOW,
    source: 'stripe',
  };
  const unverified = await maybeSignalFromVerifiedGift(fi, {
    gift: { ...gift, source: 'every.org' },
    needId: NEED,
    verified: false,
    source: 'every.org',
  });
  assert.deepEqual(unverified, { created: false, reason: 'UNVERIFIED' });
  const stripe = await maybeSignalFromVerifiedGift(fi, {
    gift,
    needId: NEED,
    verified: true,
    source: 'stripe',
  });
  assert.deepEqual(stripe, { created: false, reason: 'STRIPE_FORBIDDEN' });
  assert.equal((await fi.listSignals()).length, 0);
});

test('donor PII is rejected on subject, title, and rationale', async () => {
  const fi = intel();
  await fi.registerNeed({ needId: NEED });
  await assert.rejects(
    () =>
      fi.publishSignal({
        needId: NEED,
        source: 'operator-note',
        subject: 'jane.donor@example.org',
        observedAt: NOW,
        confidence: 0.4,
      }),
    (err) => err.code === 'DONOR_PII_FORBIDDEN' && err.field === 'subject',
  );
  await assert.rejects(
    () =>
      fi.publishSignal({
        needId: NEED,
        source: 'operator-note',
        subject: 'call 415-555-0100 about laptops',
        observedAt: NOW,
        confidence: 0.4,
      }),
    (err) => err.code === 'DONOR_PII_FORBIDDEN',
  );
  await assert.rejects(
    () =>
      fi.publishSignal({
        needId: NEED,
        source: 'operator-note',
        subject: 'lab-gap',
        observedAt: NOW,
        confidence: 0.4,
        donorName: 'Jane Donor',
      }),
    (err) => err.code === 'DONOR_PII_FORBIDDEN',
  );

  const signal = await fi.publishSignal({
    needId: NEED,
    source: 'operator-note',
    subject: 'lab-equipment-gap',
    observedAt: NOW,
    confidence: 0.7,
  });
  await assert.rejects(
    () =>
      fi.createOpportunity({
        needId: NEED,
        title: 'Follow up with Jane Donor <jane@example.org>',
        signalIds: [signal.signalId],
      }),
    (err) => err.code === 'DONOR_PII_FORBIDDEN' && err.field === 'title',
  );
  const opportunity = await fi.createOpportunity({
    needId: NEED,
    title: 'Laptop access',
    signalIds: [signal.signalId],
  });
  await assert.rejects(
    () =>
      fi.publishRecommendation({
        opportunityId: opportunity.opportunityId,
        proposedAmount: 10,
        currency: 'USD',
        rationale: 'Jane Donor at +1 415 555 0199 asked for laptops',
      }),
    (err) => err.code === 'DONOR_PII_FORBIDDEN' && err.field === 'rationale',
  );
  assert.equal((await fi.listRecommendations()).length, 0);
  assert.equal((await fi.getOpportunity(opportunity.opportunityId)).status, 'open');
});

test('stale-only support cannot recommend; Opportunity may stay open or be dismissed', async () => {
  const fi = intel();
  const stale = await happySignal(fi, { observedAt: '2026-01-01T00:00:00Z', capturedAt: '2026-01-01T00:00:00Z' });
  assert.equal(fi.isSignalStale(stale, NOW), true);
  await assert.rejects(
    () =>
      fi.createOpportunity({
        needId: NEED,
        title: 'Laptop access',
        signalIds: [stale.signalId],
      }),
    (err) => err.code === 'STALE_SUPPORT',
  );

  const fresh = await fi.publishSignal({
    needId: NEED,
    source: 'operator-note',
    subject: 'lab-gap-refresh',
    observedAt: '2026-08-10T00:00:00Z',
    confidence: 0.8,
  });
  const opportunity = await fi.createOpportunity({
    needId: NEED,
    title: 'Laptop access',
    signalIds: [stale.signalId, fresh.signalId],
  });
  assert.equal(opportunity.status, 'open');

  let t = Date.parse(NOW);
  const aging = createFundIntel({
    now: () => new Date(t).toISOString(),
    store: (await import('../src/intel/store.mjs')).createIntelMemoryStore(
      await (async () => {
        const listed = await fi.listSignals();
        const opps = await fi.listOpportunities();
        const { emptyIntelState } = await import('../src/intel/store.mjs');
        const state = emptyIntelState();
        state.needs.set(NEED, { needId: NEED, registeredAt: NOW });
        for (const s of listed) state.signals.set(s.signalId, s);
        for (const o of opps) state.opportunities.set(o.opportunityId, o);
        return state;
      })(),
    ),
  });
  t += 91 * 24 * 60 * 60 * 1000;
  await assert.rejects(
    () =>
      aging.publishRecommendation({
        opportunityId: opportunity.opportunityId,
        proposedAmount: 1,
        currency: 'USD',
        rationale: 'Only stale support remains',
      }),
    (err) => err.code === 'STALE_SUPPORT',
  );
  assert.equal((await aging.listRecommendations()).length, 0);
  const stillOpen = await aging.getOpportunity(opportunity.opportunityId);
  assert.equal(stillOpen.status, 'open');
  const dismissed = await aging.dismissOpportunity({ opportunityId: opportunity.opportunityId });
  assert.equal(dismissed.status, 'dismissed');
});

test('insufficient evidence and empty rationale do not mint a Recommendation', async () => {
  const fi = intel();
  await fi.registerNeed({ needId: NEED });
  await assert.rejects(
    () => fi.createOpportunity({ needId: NEED, title: 'Laptop access', signalIds: [] }),
    (err) => err.code === 'INSUFFICIENT_EVIDENCE',
  );
  const a = await fi.publishSignal({
    needId: NEED,
    source: 'operator-note',
    subject: 'lab-a',
    observedAt: NOW,
    confidence: 0.5,
  });
  await fi.registerNeed({ needId: 'need-other' });
  const b = await fi.publishSignal({
    needId: 'need-other',
    source: 'operator-note',
    subject: 'other-gap',
    observedAt: NOW,
    confidence: 0.5,
  });
  await assert.rejects(
    () => fi.createOpportunity({ needId: NEED, title: 'Mixed', signalIds: [a.signalId, b.signalId] }),
    (err) => err.code === 'NEED_MISMATCH',
  );
  const opportunity = await fi.createOpportunity({
    needId: NEED,
    title: 'Laptop access',
    signalIds: [a.signalId],
  });
  await assert.rejects(
    () =>
      fi.publishRecommendation({
        opportunityId: opportunity.opportunityId,
        proposedAmount: 0,
        currency: 'USD',
        rationale: '   ',
      }),
    (err) => err.code === 'RATIONALE_REQUIRED',
  );
  assert.equal((await fi.listRecommendations()).length, 0);
  assert.equal((await fi.getOpportunity(opportunity.opportunityId)).status, 'open');
});

test('gift without a Need credits a pot and does not invent a Recommendation', async () => {
  const fi = intel();
  const svc = createService({
    orgId: 'org_1',
    now: () => NOW,
    intel: fi,
    resolveNeedForGift: () => null,
  });
  const credited = await svc.ingestEveryOrg({
    chargeId: 'chg-no-need',
    amount: '25.00',
    netAmount: '25.00',
    currency: 'USD',
    donationDate: NOW,
    toNonprofit: { slug: 'x', name: 'X' },
  });
  assert.equal(credited.created, true);
  const avail = await svc.listAvailable();
  assert.ok(avail.some((p) => p.available === '25.00'));
  assert.equal((await fi.listSignals()).length, 0);
  assert.equal((await fi.listOpportunities()).length, 0);
  assert.equal((await fi.listRecommendations()).length, 0);

  const skipped = await maybeSignalFromVerifiedGift(fi, {
    gift: credited.gift,
    needId: '',
    verified: true,
    source: 'every.org',
  });
  assert.equal(skipped.reason, 'NEED_REQUIRED');
});

test('verified csv gift MAY produce a Signal as a separate write; subject is a pot key', async () => {
  const fi = intel();
  await fi.registerNeed({ needId: NEED });
  const svc = createService({
    orgId: 'org_1',
    now: () => NOW,
    intel: fi,
    resolveNeedForGift: (gift) => (gift.campaignKey === 'hardware' ? NEED : null),
  });
  const csv =
    'chargeId,netAmount,campaignKey,programKey,donatedAt,email\n' +
    'csv-intel-1,15.00,hardware,laptops,2026-08-12T00:00:00Z,donor@example.org\n';
  const result = await svc.importCsv(csv);
  assert.equal(result.created, 1);
  const signals = await fi.listSignals();
  assert.equal(signals.length, 1);
  assert.equal(signals[0].source, 'csv');
  assert.equal(signals[0].subject, 'hardware/laptops');
  assert.equal(signals[0].subject.includes('@'), false);
  const trail = await svc.getTrail();
  assert.equal(trail.gifts[0].source, 'csv');
  assert.notEqual(trail.gifts[0].source, 'stripe');
});

test('later Recommendation is a new recommendationId and does not rewrite history', async () => {
  const fi = intel();
  const signal = await happySignal(fi);
  const opportunity = await fi.createOpportunity({
    needId: NEED,
    title: 'Laptop access',
    signalIds: [signal.signalId],
  });
  const first = await fi.publishRecommendation({
    opportunityId: opportunity.opportunityId,
    proposedAmount: 100,
    currency: 'USD',
    rationale: 'First advisory proposal',
  });
  const second = await fi.publishRecommendation({
    opportunityId: opportunity.opportunityId,
    proposedAmount: 150,
    currency: 'USD',
    rationale: 'Revised advisory proposal; prior record stays',
  });
  assert.notEqual(second.recommendation.recommendationId, first.recommendation.recommendationId);
  const listed = await fi.listRecommendations();
  assert.equal(listed.length, 2);
  assert.equal(listed[0].proposedAmount, 100);
  assert.equal(listed[1].proposedAmount, 150);
  assert.equal(listed[0].rationale, 'First advisory proposal');
});

test('published staleness policy is explicit and not claimed as a SPEC TTL', () => {
  assert.equal(STALENESS_POLICY.specSetsNumericTtl, false);
  assert.equal(STALENESS_POLICY.defaultHorizon, 'P90D');
  assert.equal(STALENESS_POLICY.defaultHorizonDays, 90);
  assert.equal(STALENESS_POLICY.specVersion, '2.1.0');
});

test('Recommendation path has no pot handles — available stays on the gift store only', async () => {
  const fi = intel();
  const svc = createService({ orgId: 'org_1', now: () => NOW });
  await svc.ingestEveryOrg({
    chargeId: 'chg-iso',
    amount: '50.00',
    netAmount: '50.00',
    currency: 'USD',
    donationDate: NOW,
    designation: 'Lab',
    fromFundraiser: { title: 'Spring' },
    toNonprofit: { slug: 'x', name: 'X' },
  });
  const before = await svc.listAvailable();
  const signal = await happySignal(fi);
  const opportunity = await fi.createOpportunity({
    needId: NEED,
    title: 'Laptop access',
    signalIds: [signal.signalId],
  });
  await fi.publishRecommendation({
    opportunityId: opportunity.opportunityId,
    proposedAmount: 9999,
    currency: 'USD',
    rationale: 'Advisory only; must not debit the spring/lab pot',
  });
  const after = await svc.listAvailable();
  assert.deepEqual(after, before);
  const trail = await svc.getTrail();
  assert.equal(trail.allocations.length, 0);
});
