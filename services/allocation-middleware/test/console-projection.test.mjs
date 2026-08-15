import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createService } from '../src/app/service.mjs';
import { createMemoryStore, serializeState } from '../src/app/store-core.mjs';
import {
  CONSUMER_PIN,
  createFundIntel,
  createIntelMemoryStore,
  evaluateMissionMetrics,
  METRIC_FAMILY_IDS,
  MISSION_GRAPH_SPEC,
  MISSION_METRICS_SPEC,
  projectAgiConsole,
  projectAgiConsoleFromRecords,
  serializeIntelState,
} from '../src/intel/index.mjs';

const NEED = 'need-community-ai-lab';
const NOW = '2026-08-15T19:45:00Z';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

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

function assertHonestConsole(view) {
  assert.equal(view.kind, 'AgiConsoleProjection');
  assert.equal(view.live, false);
  assert.equal(view.ready, false);
  assert.equal(view.sourceOfRecord, false);
  assert.equal(view.persisted, false);
  assert.deepEqual(view.consumerPin, CONSUMER_PIN);
  assert.equal(view.consumerPin.version, 'v2.0.0');
  assert.equal(view.consumerPin.commit, 'c089739');
  assert.deepEqual(view.specs['SPEC-029'], MISSION_GRAPH_SPEC);
  assert.deepEqual(view.specs['SPEC-030'], MISSION_METRICS_SPEC);
  assert.equal(view.specs['SPEC-029'].status, 'proposed');
  assert.equal(view.specs['SPEC-030'].status, 'proposed');
  assert.equal(view.learningFeedback.status, 'NOT_COMPUTABLE');
  assert.equal(view.learningFeedback.mintsSignal, false);
  assert.equal(view.learningFeedback.reason, 'NO_VERIFIED_IMPACT');
}

test('projects existing Signal / Opportunity / Recommendation ids', async () => {
  const fi = createFundIntel({ now: () => NOW });
  const { signal, opportunity, recommendation } = await seedIntel(fi);

  const view = await projectAgiConsoleFromRecords({
    intel: fi,
    trail: { gifts: [], pots: [], allocations: [] },
  }, { now: () => NOW });

  assertHonestConsole(view);
  assert.equal(view.status, 'PROJECTED');
  assert.equal(view.graph.status, 'PROJECTED');
  assert.deepEqual(view.records.signalIds, [signal.signalId]);
  assert.deepEqual(view.records.opportunityIds, [opportunity.opportunityId]);
  assert.deepEqual(view.records.recommendationIds, [recommendation.recommendationId]);
  assert.equal(view.records.signalIds.includes('invented-signal'), false);
});

test('projection does not write intel or allocation stores', async () => {
  const intelInner = createIntelMemoryStore();
  const intelStore = countingStore(intelInner);
  const fi = createFundIntel({ now: () => NOW, store: intelStore });
  await seedIntel(fi);
  const intelSavesAfterSeed = intelStore.saves();

  const allocInner = createMemoryStore();
  const allocStore = countingStore(allocInner);
  const svc = createService({ orgId: 'org_1', now: () => NOW, store: allocStore });
  await svc.ingestEveryOrg({
    chargeId: 'chg-console-1',
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

  const view = await projectAgiConsoleFromRecords({ intel: fi, trail }, { now: () => NOW });
  assert.equal(view.status, 'PROJECTED');
  assert.equal(intelStore.saves(), intelSavesAfterSeed);
  assert.equal(allocStore.saves(), allocSavesAfterCredit);
  assert.deepEqual(serializeIntelState(await intelInner.load()), intelBefore);
  assert.deepEqual(serializeState(await allocInner.load()), allocBefore);
});

test('projection does not credit, debit, or lock pots', async () => {
  const fi = createFundIntel({ now: () => NOW });
  await seedIntel(fi);
  const svc = createService({ orgId: 'org_1', now: () => NOW });
  await svc.ingestEveryOrg({
    chargeId: 'chg-console-2',
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

  const view = await projectAgiConsoleFromRecords({
    intel: fi,
    trail: await svc.getTrail(),
  }, { now: () => NOW });
  assert.equal(view.status, 'PROJECTED');

  const after = await svc.listAvailable();
  const potAfter = after.find((p) => p.programKey === 'lab');
  assert.deepEqual(potAfter, potBefore);
  assert.equal((await svc.getTrail()).allocations.length, 1);
});

test('metric family values stay null and NOT_COMPUTABLE', async () => {
  const fi = createFundIntel({ now: () => NOW });
  await seedIntel(fi);
  const view = await projectAgiConsoleFromRecords({
    intel: fi,
    trail: { gifts: [], pots: [], allocations: [] },
  }, { now: () => NOW });

  assert.equal(view.metrics.status, 'NOT_COMPUTABLE');
  for (const familyId of METRIC_FAMILY_IDS) {
    const family = view.metrics.families[familyId];
    assert.equal(family.metricId, familyId);
    assert.equal(family.status, 'NOT_COMPUTABLE');
    assert.equal(family.epistemic, 'NOT_COMPUTABLE');
    assert.equal(family.value, null);
    assert.equal(typeof family.value === 'number', false);
    assert.ok(family.reason === 'MISSING_INPUTS' || family.reason === 'NO_FORMULA');
    assert.equal(family.score, undefined);
    assert.equal(family.index, undefined);
    assert.equal(family.rate, undefined);
  }

  const composed = evaluateMissionMetrics({
    intel: {
      needs: await fi.listNeeds(),
      signals: await fi.listSignals(),
      opportunities: await fi.listOpportunities(),
      recommendations: await fi.listRecommendations(),
    },
    trail: { gifts: [], pots: [], allocations: [] },
  }, { now: () => NOW });
  for (const familyId of METRIC_FAMILY_IDS) {
    assert.equal(view.metrics.families[familyId].value, composed.families[familyId].value);
    assert.equal(composed.families[familyId].value, null);
  }
});

test('absent Impact does not invent learning, Impact, or a Signal mint', async () => {
  const fi = createFundIntel({ now: () => NOW });
  await seedIntel(fi);
  const signalsBefore = await fi.listSignals();

  const view = projectAgiConsole({
    intel: {
      needs: [{ needId: NEED }],
      signals: await fi.listSignals(),
      opportunities: await fi.listOpportunities(),
      recommendations: await fi.listRecommendations(),
    },
    trail: {
      allocations: [{
        id: 'alloc-1',
        orgId: 'org_1',
        campaignKey: 'spring',
        programKey: 'lab',
        amountCents: 1000n,
        purpose: 'Equipment',
        status: 'approved',
        approvedAt: NOW,
        approvedBy: 'director@example.org',
      }],
      pots: [{
        orgId: 'org_1',
        campaignKey: 'spring',
        programKey: 'lab',
        creditedCents: 10000n,
        allocatedCents: 1000n,
      }],
      proofs: {
        'alloc-1': [{ id: 'ev-1', allocationId: 'alloc-1', attachedAt: NOW }],
      },
      impactNotices: [{
        impactNoticeId: 'notice-1',
        allocationId: 'alloc-1',
        evidenceId: 'ev-1',
        proofWaived: false,
      }],
    },
  }, { now: () => NOW });

  assertHonestConsole(view);
  assert.equal(view.records.signalIds.length, 1);
  assert.equal(view.impact, undefined);
  assert.equal(view.impactId, undefined);
  assert.ok(view.notComputable.some((item) => item.type === 'Impact' && item.reason === 'NO_VERIFIED_IMPACT'));
  assert.ok(view.notComputable.some((item) => item.type === 'LearningFeedback'));
  assert.deepEqual(view.forbiddenPathsPresent, []);
  assert.equal(view.learningFeedback.mintsSignal, false);
  const blob = JSON.stringify(view);
  assert.equal(blob.includes('"type":"Impact"') && blob.includes('"canonicalId"'), false);
  assert.equal(blob.includes('Impact→Recommendation'), false);
  assert.equal(blob.includes('workers.dev'), false);
  assert.deepEqual(await fi.listSignals(), signalsBefore);
});

test('consumer pin remains v2.0.0 and specs stay Proposed', () => {
  assert.equal(CONSUMER_PIN.version, 'v2.0.0');
  assert.equal(CONSUMER_PIN.commit, 'c089739');
  const view = projectAgiConsole(undefined, { now: () => NOW });
  assertHonestConsole(view);
  assert.equal(view.status, 'NOT_COMPUTABLE');
  assert.equal(MISSION_GRAPH_SPEC.status, 'proposed');
  assert.equal(MISSION_METRICS_SPEC.status, 'proposed');

  const rootYml = readFileSync(join(REPO_ROOT, 'platform-conformance.yml'), 'utf8');
  assert.match(rootYml, /platformSpecificationRelease: v2\.0\.0/);
  const specYml = readFileSync(join(REPO_ROOT, 'platform-spec/conformance.yml'), 'utf8');
  assert.match(specYml, /version: 2\.0\.0/);
});

test('missing or empty inputs fail closed without inventing records', () => {
  const missing = projectAgiConsole(undefined, { now: () => NOW });
  assert.equal(missing.status, 'NOT_COMPUTABLE');
  assert.equal(missing.reason, 'MISSING_INPUTS');
  assert.equal(missing.graph.status, 'NOT_COMPUTABLE');
  assert.deepEqual(missing.records, { signalIds: [], opportunityIds: [], recommendationIds: [] });
  assert.equal(missing.learningFeedback.mintsSignal, false);
  for (const familyId of METRIC_FAMILY_IDS) {
    assert.equal(missing.metrics.families[familyId].value, null);
    assert.equal(missing.metrics.families[familyId].status, 'NOT_COMPUTABLE');
  }

  const empty = projectAgiConsole({
    intel: { needs: [], signals: [], opportunities: [], recommendations: [] },
    trail: { gifts: [], pots: [], allocations: [], proofs: {}, impactNotices: [] },
  }, { now: () => NOW });
  assert.equal(empty.status, 'EMPTY');
  assert.equal(empty.graph.status, 'EMPTY');
  assert.deepEqual(empty.records, { signalIds: [], opportunityIds: [], recommendationIds: [] });
  assert.equal(empty.learningFeedback.mintsSignal, false);
});

test('console omits donor PII even if a gift snapshot carries it', () => {
  const view = projectAgiConsole({
    trail: {
      gifts: [{
        chargeId: 'chg-pii',
        orgId: 'org_1',
        campaignKey: 'spring',
        programKey: 'lab',
        netCents: 100n,
        donatedAt: NOW,
        source: 'every.org',
        donorEmail: 'donor@example.org',
        donorName: 'Ada Donor',
        donorPhone: '+15555550100',
      }],
      pots: [{
        orgId: 'org_1',
        campaignKey: 'spring',
        programKey: 'lab',
        creditedCents: 100n,
        allocatedCents: 0n,
      }],
    },
  }, { now: () => NOW });
  const blob = JSON.stringify(view);
  assert.equal(blob.includes('donor@example.org'), false);
  assert.equal(blob.includes('Ada Donor'), false);
  assert.equal(blob.includes('+15555550100'), false);
  assert.equal(view.status, 'PROJECTED');
  assert.deepEqual(view.records.signalIds, []);
});
