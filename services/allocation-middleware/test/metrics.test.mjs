import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createService } from '../src/app/service.mjs';
import { createMemoryStore, serializeState } from '../src/app/store-core.mjs';
import {
  createFundIntel,
  createIntelMemoryStore,
  serializeIntelState,
  evaluateMetric,
  evaluateMissionMetrics,
  METRIC_FAMILY_IDS,
  METRIC_POLICIES,
  MISSION_METRICS_SPEC,
  CONSUMER_PIN,
} from '../src/intel/index.mjs';

const NEED = 'need-community-ai-lab';
const NOW = '2026-08-15T19:25:00Z';

function countingStore(inner) {
  let saves = 0;
  return {
    saves: () => saves,
    async load() {
      return inner.load();
    },
    async save(next) {
      saves += 1;
      return inner.save(next);
    },
  };
}

async function seedIntel(fi) {
  await fi.registerNeed({ needId: NEED });
  const signal = await fi.publishSignal({
    needId: NEED,
    source: 'operator-note',
    subject: 'neighborhood-ai-lab-equipment-gap',
    observedAt: '2026-08-03T15:50:00Z',
    capturedAt: '2026-08-03T15:50:00Z',
    confidence: 0.92,
  });
  const opportunity = await fi.createOpportunity({
    needId: NEED,
    title: 'Laptop access',
    signalIds: [signal.signalId],
  });
  const { recommendation } = await fi.publishRecommendation({
    opportunityId: opportunity.opportunityId,
    proposedAmount: 2500,
    currency: 'USD',
    rationale: 'Equip the lab from retained survey and operator notes',
  });
  return { signal, opportunity, recommendation };
}

function populatedInputs(familyId, extras = {}) {
  const populated = {
    OFS: { opportunity: { opportunityId: 'opp-1' }, need: { needId: NEED } },
    NPI: { need: { needId: NEED } },
    EC: { allocation: { id: 'alloc-1' } },
    FIL: {
      startTimestamp: '2026-08-01T00:00:00Z',
      endTimestamp: '2026-08-10T00:00:00Z',
      startKind: 'approval',
      verifiedImpact: { impactId: 'imp-1', verified: true },
    },
    MY: {
      verifiedImpact: { impactId: 'imp-1', verified: true },
      resourceBasis: { amountCents: 1000, currency: 'USD' },
      populationContext: { population: 'lab-users' },
      comparabilityBoundary: 'single-tenant-lab',
    },
    ECONF: {
      subject: { type: 'Signal', signalId: 'sig-1' },
      evidence: { evidenceId: 'ev-1' },
    },
    ORR: {
      cohort: [{ opportunityId: 'opp-1' }],
      denominator: 'qualified-opportunity',
      cohortDefinition: { version: '0.1.0', window: 'P90D' },
      stageDefinitions: ['recommendation', 'approved-pursuit', 'execution', 'funded-result', 'verified-impact'],
      policyVersion: '0.1.0',
    },
  };
  return { ...populated[familyId], ...extras };
}

function assertFailClosed(result, familyId, reason) {
  assert.equal(result.kind, 'MissionIntelligenceMetric');
  assert.equal(result.metricId, familyId);
  assert.equal(result.status, 'NOT_COMPUTABLE');
  assert.equal(result.epistemic, 'NOT_COMPUTABLE');
  assert.equal(result.reason, reason);
  assert.equal(result.value, null);
  assert.equal(result.formula, null);
  assert.equal(result.spec.status, 'proposed');
  assert.deepEqual(result.spec, MISSION_METRICS_SPEC);
  assert.equal(result.consumerPin.version, 'v2.0.0');
  assert.deepEqual(result.consumerPin, CONSUMER_PIN);
  assert.equal(result.policy.status, 'proposed');
  assert.equal(result.policy.familyId, familyId);
  assert.equal(result.policy.version, '0.1.0');
  assert.equal(result.policy.formula, null);
}

test('SPEC-030 names exactly seven families and stays Proposed 0.1.0', () => {
  assert.deepEqual(METRIC_FAMILY_IDS, ['OFS', 'NPI', 'EC', 'FIL', 'MY', 'ECONF', 'ORR']);
  assert.equal(METRIC_FAMILY_IDS.includes('PIN'), false);
  assert.equal(Object.keys(METRIC_POLICIES).sort().join(','), [...METRIC_FAMILY_IDS].sort().join(','));
  assert.equal(MISSION_METRICS_SPEC.id, 'SPEC-030');
  assert.equal(MISSION_METRICS_SPEC.version, '0.1.0');
  assert.equal(MISSION_METRICS_SPEC.status, 'proposed');
  assert.equal(CONSUMER_PIN.version, 'v2.0.0');
  assert.equal(CONSUMER_PIN.commit, 'c089739');
  for (const familyId of METRIC_FAMILY_IDS) {
    const policy = METRIC_POLICIES[familyId];
    assert.equal(policy.id && policy.version && policy.status, 'proposed');
    assert.equal(policy.familyId, familyId);
    assert.equal(policy.formula, null);
    assert.ok(Array.isArray(policy.requiredInputs) && policy.requiredInputs.length > 0);
  }
});

test('each family returns NOT_COMPUTABLE with a stated reason', () => {
  for (const familyId of METRIC_FAMILY_IDS) {
    const missing = evaluateMetric(familyId, undefined, { now: () => NOW });
    assertFailClosed(missing, familyId, 'MISSING_INPUTS');
    assert.equal(missing.producedAt, NOW);

    const empty = evaluateMetric(familyId, {}, { now: () => NOW });
    assertFailClosed(empty, familyId, 'MISSING_INPUTS');

    const populated = evaluateMetric(familyId, populatedInputs(familyId), { now: () => NOW });
    assertFailClosed(populated, familyId, 'NO_FORMULA');
    assert.equal(
      populated.reproducibility.reason,
      'SPEC_030_DEFINES_NO_FORMULA',
    );
  }
});

test('unknown family including PIN fails closed and is not invented', () => {
  const pin = evaluateMetric('PIN', populatedInputs('OFS'), { now: () => NOW });
  assert.equal(pin.status, 'NOT_COMPUTABLE');
  assert.equal(pin.reason, 'UNKNOWN_FAMILY');
  assert.equal(pin.value, null);
  assert.equal(pin.metricId, 'PIN');
});

test('evaluation does not write intel or allocation stores', async () => {
  const intelInner = createIntelMemoryStore();
  const intelStore = countingStore(intelInner);
  const fi = createFundIntel({ now: () => NOW, store: intelStore });
  await seedIntel(fi);
  const intelSavesAfterSeed = intelStore.saves();

  const allocInner = createMemoryStore();
  const allocStore = countingStore(allocInner);
  const svc = createService({ orgId: 'org_1', now: () => NOW, store: allocStore });
  await svc.ingestEveryOrg({
    chargeId: 'chg-metrics-1',
    amount: '100.00',
    netAmount: '100.00',
    currency: 'USD',
    donationDate: '2026-08-10T00:00:00Z',
    designation: 'Lab',
    fromFundraiser: { title: 'Spring', slug: 'spring' },
    toNonprofit: { slug: 'x', name: 'X' },
  });
  const allocSavesAfterCredit = allocStore.saves();

  const intelBefore = serializeIntelState(await intelInner.load());
  const allocBefore = serializeState(await allocInner.load());
  const trail = await svc.getTrail();
  const signals = await fi.listSignals();
  const opportunities = await fi.listOpportunities();
  const recommendations = await fi.listRecommendations();

  const batch = evaluateMissionMetrics({
    intel: { needs: [{ needId: NEED }], signals, opportunities, recommendations },
    trail,
  }, { now: () => NOW });

  assert.equal(batch.status, 'NOT_COMPUTABLE');
  assert.equal(intelStore.saves(), intelSavesAfterSeed);
  assert.equal(allocStore.saves(), allocSavesAfterCredit);
  assert.deepEqual(serializeIntelState(await intelInner.load()), intelBefore);
  assert.deepEqual(serializeState(await allocInner.load()), allocBefore);
  assert.deepEqual(await fi.listSignals(), signals);
});

test('evaluation does not credit, debit, or lock pots', async () => {
  const fi = createFundIntel({ now: () => NOW });
  await seedIntel(fi);
  const svc = createService({ orgId: 'org_1', now: () => NOW });
  await svc.ingestEveryOrg({
    chargeId: 'chg-metrics-2',
    amount: '100.00',
    netAmount: '100.00',
    currency: 'USD',
    donationDate: '2026-08-10T00:00:00Z',
    designation: 'Lab',
    fromFundraiser: { title: 'Spring', slug: 'spring' },
    toNonprofit: { slug: 'x', name: 'X' },
  });
  await svc.allocate({
    campaignKey: 'spring',
    programKey: 'lab',
    amount: '40.00',
    purpose: 'Equipment',
    approvedBy: 'director@example.org',
  });
  const before = await svc.listAvailable();
  const potBefore = before.find((p) => p.programKey === 'lab');
  assert.equal(potBefore.available, '60.00');
  assert.equal(potBefore.credited, '100.00');
  assert.equal(potBefore.allocated, '40.00');

  const batch = evaluateMissionMetrics({
    intel: {
      needs: [{ needId: NEED }],
      signals: await fi.listSignals(),
      opportunities: await fi.listOpportunities(),
      recommendations: await fi.listRecommendations(),
    },
    trail: await svc.getTrail(),
  }, { now: () => NOW });

  assert.equal(batch.status, 'NOT_COMPUTABLE');
  for (const familyId of METRIC_FAMILY_IDS) {
    assert.equal(batch.families[familyId].status, 'NOT_COMPUTABLE');
    assert.equal(batch.families[familyId].value, null);
  }

  const after = await svc.listAvailable();
  const potAfter = after.find((p) => p.programKey === 'lab');
  assert.deepEqual(potAfter, potBefore);
  assert.equal((await svc.getTrail()).allocations.length, 1);
});

test('no invented numeric value even when inputs look complete', () => {
  const batch = evaluateMissionMetrics({
    OFS: populatedInputs('OFS'),
    NPI: populatedInputs('NPI'),
    EC: populatedInputs('EC'),
    FIL: populatedInputs('FIL'),
    MY: populatedInputs('MY'),
    ECONF: populatedInputs('ECONF'),
    ORR: populatedInputs('ORR'),
  }, { now: () => NOW });

  const blob = JSON.stringify(batch);
  for (const familyId of METRIC_FAMILY_IDS) {
    const result = batch.families[familyId];
    assertFailClosed(result, familyId, 'NO_FORMULA');
    assert.equal(typeof result.value === 'number', false);
    assert.equal(result.score, undefined);
    assert.equal(result.index, undefined);
    assert.equal(result.rate, undefined);
    assert.equal(result.latency, undefined);
  }
  assert.equal(/\b(score|index|rate|latencyDays)\b/.test(blob) && /":\s*-?\d/.test(blob), false);
  assert.equal(batch.learningFeedback.status, 'NOT_COMPUTABLE');
  assert.equal(batch.learningFeedback.reason, 'NO_VERIFIED_IMPACT');
  assert.equal(batch.learningFeedback.mintsSignal, false);
});

test('ImpactNotice is not Impact; Learning Feedback stays NOT_COMPUTABLE', () => {
  const fil = evaluateMetric('FIL', {
    startTimestamp: '2026-08-01T00:00:00Z',
    endTimestamp: '2026-08-10T00:00:00Z',
    startKind: 'approval',
    impactNotice: {
      impactNoticeId: 'notice-1',
      allocationId: 'alloc-1',
      evidenceId: 'ev-1',
    },
    verifiedImpact: {
      impactNoticeId: 'notice-1',
    },
  }, { now: () => NOW });
  assertFailClosed(fil, 'FIL', 'MISSING_INPUTS');
  assert.ok(fil.notes.includes('IMPACT_NOTICE_IS_NOT_IMPACT'));

  const my = evaluateMetric('MY', {
    verifiedImpact: { impactNoticeId: 'notice-1' },
    resourceBasis: { amountCents: 1000, currency: 'USD' },
    populationContext: { population: 'lab-users' },
    comparabilityBoundary: 'single-tenant-lab',
  }, { now: () => NOW });
  assertFailClosed(my, 'MY', 'MISSING_INPUTS');
  assert.ok(my.notes.includes('IMPACT_NOTICE_IS_NOT_IMPACT'));

  const batch = evaluateMissionMetrics({
    trail: {
      impactNotices: [{ impactNoticeId: 'notice-1', allocationId: 'alloc-1' }],
    },
  }, { now: () => NOW });
  assert.equal(batch.learningFeedback.status, 'NOT_COMPUTABLE');
  assert.equal(batch.learningFeedback.mintsSignal, false);
  assert.equal(batch.learningFeedback.reason, 'NO_VERIFIED_IMPACT');
  assert.equal(batch.forbiddenPathsPresent, undefined);
  assert.equal(JSON.stringify(batch).includes('Impact→Recommendation'), false);
});

test('donor PII is omitted from metric outputs', () => {
  const result = evaluateMetric('OFS', {
    opportunity: { opportunityId: 'opp-1' },
    need: { needId: NEED },
    gift: {
      chargeId: 'chg-pii',
      donorEmail: 'donor@example.org',
      donorName: 'Ada Donor',
      donorPhone: '+15555550100',
    },
  }, { now: () => NOW });
  const blob = JSON.stringify(result);
  assert.equal(blob.includes('donor@example.org'), false);
  assert.equal(blob.includes('Ada Donor'), false);
  assert.equal(blob.includes('+15555550100'), false);
  assert.equal(result.status, 'NOT_COMPUTABLE');
});
