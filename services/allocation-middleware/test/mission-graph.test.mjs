import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createService } from '../src/app/service.mjs';
import { createMemoryStore, serializeState } from '../src/app/store-core.mjs';
import {
  createFundIntel,
  createIntelMemoryStore,
  serializeIntelState,
  projectMissionGraph,
  projectMissionGraphFromRecords,
  MISSION_GRAPH_SPEC,
  CONSUMER_PIN,
} from '../src/intel/index.mjs';

const NEED = 'need-community-ai-lab';
const NOW = '2026-08-15T19:00:00Z';

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

test('projects in-process Fund Intel Signal / Opportunity / Recommendation records', async () => {
  const fi = createFundIntel({ now: () => NOW });
  const { signal, opportunity, recommendation } = await seedIntel(fi);

  const graph = await projectMissionGraphFromRecords({ intel: fi, trail: { gifts: [], pots: [], allocations: [] } });

  assert.equal(graph.kind, 'MissionGraphProjection');
  assert.equal(graph.status, 'PROJECTED');
  assert.equal(graph.sourceOfRecord, false);
  assert.equal(graph.persisted, false);
  assert.deepEqual(graph.spec, MISSION_GRAPH_SPEC);
  assert.equal(graph.spec.status, 'proposed');
  assert.deepEqual(graph.consumerPin, CONSUMER_PIN);
  assert.equal(graph.consumerPin.version, 'v2.0.0');

  const types = graph.nodes.map((n) => n.type).sort();
  assert.deepEqual(types, ['Need', 'Opportunity', 'Recommendation', 'Signal']);
  assert.ok(graph.nodes.some((n) => n.type === 'Need' && n.canonicalId === NEED && n.owner === 'fund-intel'));
  assert.ok(graph.nodes.some((n) => n.type === 'Signal' && n.canonicalId === signal.signalId));
  assert.ok(graph.nodes.some((n) => n.type === 'Opportunity' && n.canonicalId === opportunity.opportunityId));
  assert.ok(graph.nodes.some((n) => n.type === 'Recommendation' && n.canonicalId === recommendation.recommendationId));

  assert.ok(graph.edges.some((e) => e.type === 'OBSERVED_ABOUT' && e.from === `signal:${signal.signalId}` && e.to === `need:${NEED}`));
  assert.ok(graph.edges.some((e) => e.type === 'SUPPORTED_BY' && e.from === `opportunity:${opportunity.opportunityId}` && e.to === `signal:${signal.signalId}`));
  assert.ok(graph.edges.some((e) => e.type === 'ADVISES' && e.from === `recommendation:${recommendation.recommendationId}` && e.to === `opportunity:${opportunity.opportunityId}`));
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
    chargeId: 'chg-graph-1',
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

  const graph = await projectMissionGraphFromRecords({ intel: fi, trail });
  assert.equal(graph.status, 'PROJECTED');
  assert.equal(intelStore.saves(), intelSavesAfterSeed);
  assert.equal(allocStore.saves(), allocSavesAfterCredit);
  assert.deepEqual(serializeIntelState(await intelInner.load()), intelBefore);
  assert.deepEqual(serializeState(await allocInner.load()), allocBefore);
});

test('absent Impact does not invent learning or mint a Signal', async () => {
  const fi = createFundIntel({ now: () => NOW });
  await seedIntel(fi);
  const signalsBefore = await fi.listSignals();

  const svc = createService({ orgId: 'org_1', now: () => NOW });
  await svc.ingestEveryOrg({
    chargeId: 'chg-graph-2',
    amount: '50.00',
    netAmount: '50.00',
    currency: 'USD',
    donationDate: '2026-08-10T00:00:00Z',
    toNonprofit: { slug: 'x', name: 'X' },
  });
  const alloc = await svc.allocate({
    campaignKey: 'general',
    programKey: 'undesignated',
    amount: '10.00',
    purpose: 'Test',
    approvedBy: 'director@example.org',
  });
  await svc.attachProof({
    allocationId: alloc.id,
    uri: 'https://evidence.example/photo.jpg',
    attachedBy: 'director@example.org',
  });
  const trail = await svc.getTrail();
  assert.equal(trail.impactNotices.length, 0);

  const graph = await projectMissionGraphFromRecords({ intel: fi, trail });
  assert.equal(graph.learningFeedback.status, 'NOT_COMPUTABLE');
  assert.equal(graph.learningFeedback.mintsSignal, false);
  assert.equal(graph.learningFeedback.reason, 'NO_VERIFIED_IMPACT');
  assert.ok(graph.notComputable.some((item) => item.type === 'Impact' && item.reason === 'NO_VERIFIED_IMPACT'));
  assert.ok(graph.notComputable.some((item) => item.type === 'LearningFeedback'));
  assert.equal(graph.nodes.some((n) => n.type === 'Impact'), false);
  assert.equal(graph.nodes.some((n) => n.type === 'LearningFeedback'), false);
  assert.deepEqual(graph.forbiddenPathsPresent, []);
  assert.equal(
    graph.edges.some((e) => e.from.startsWith('impact:') || e.type.includes('Learning')),
    false,
  );
  assert.deepEqual(await fi.listSignals(), signalsBefore);
});

test('ImpactNotice is not projected as Impact and opens no Impact→action path', async () => {
  const graph = projectMissionGraph({
    intel: { signals: [], opportunities: [], recommendations: [], needs: [] },
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
  });

  assert.ok(graph.nodes.some((n) => n.type === 'ImpactNotice' && n.canonicalId === 'notice-1'));
  assert.equal(graph.nodes.some((n) => n.type === 'Impact'), false);
  assert.ok(graph.notComputable.some((item) => item.type === 'Impact'));
  assert.equal(graph.learningFeedback.mintsSignal, false);
  assert.equal(
    graph.edges.some((e) => e.from.startsWith('impact:') && (
      e.to.startsWith('recommendation:')
      || e.to.startsWith('approval:')
      || e.to.startsWith('allocation:')
      || e.to.startsWith('execution:')
    )),
    false,
  );
});

test('projection does not credit, debit, or lock pots', async () => {
  const fi = createFundIntel({ now: () => NOW });
  await seedIntel(fi);
  const svc = createService({ orgId: 'org_1', now: () => NOW });
  await svc.ingestEveryOrg({
    chargeId: 'chg-graph-3',
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

  const graph = await projectMissionGraphFromRecords({ intel: fi, trail: await svc.getTrail() });
  assert.equal(graph.status, 'PROJECTED');
  assert.ok(graph.nodes.some((n) => n.type === 'Pot'));
  assert.ok(graph.nodes.some((n) => n.type === 'GiftCredit'));
  assert.ok(graph.nodes.some((n) => n.type === 'Allocation'));
  assert.ok(graph.nodes.some((n) => n.type === 'Approval'));

  const after = await svc.listAvailable();
  const potAfter = after.find((p) => p.programKey === 'lab');
  assert.deepEqual(potAfter, potBefore);
  assert.equal((await svc.getTrail()).allocations.length, 1);
});

test('missing or empty inputs fail closed without inventing nodes', () => {
  const missing = projectMissionGraph();
  assert.equal(missing.status, 'NOT_COMPUTABLE');
  assert.equal(missing.reason, 'MISSING_INPUTS');
  assert.deepEqual(missing.nodes, []);
  assert.deepEqual(missing.edges, []);
  assert.equal(missing.learningFeedback.status, 'NOT_COMPUTABLE');

  const nullSources = projectMissionGraph({ intel: null, trail: null });
  assert.equal(nullSources.status, 'NOT_COMPUTABLE');
  assert.deepEqual(nullSources.nodes, []);

  const empty = projectMissionGraph({
    intel: { needs: [], signals: [], opportunities: [], recommendations: [] },
    trail: { gifts: [], pots: [], allocations: [], proofs: {}, impactNotices: [] },
  });
  assert.equal(empty.status, 'EMPTY');
  assert.deepEqual(empty.nodes, []);
  assert.deepEqual(empty.edges, []);
  assert.equal(empty.learningFeedback.mintsSignal, false);
});

test('dangling supporting Signal is NOT_COMPUTABLE and is not invented', () => {
  const graph = projectMissionGraph({
    intel: {
      needs: [{ needId: NEED }],
      signals: [],
      opportunities: [{
        opportunityId: '11111111-1111-4111-8111-111111111111',
        needId: NEED,
        status: 'open',
        signalIds: ['missing-signal'],
      }],
      recommendations: [],
    },
    trail: {},
  });
  assert.equal(graph.nodes.some((n) => n.type === 'Signal'), false);
  assert.ok(graph.notComputable.some((item) => (
    item.type === 'OpportunitySupportingSignal'
    && item.reason === 'SUPPORTING_SIGNAL_MISSING'
    && item.refs.signalId === 'missing-signal'
  )));
  assert.equal(graph.edges.some((e) => e.to === 'signal:missing-signal'), false);
});

test('projection omits donor PII even if a gift snapshot carries it', () => {
  const graph = projectMissionGraph({
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
  });
  const blob = JSON.stringify(graph);
  assert.equal(blob.includes('donor@example.org'), false);
  assert.equal(blob.includes('Ada Donor'), false);
  assert.equal(blob.includes('+15555550100'), false);
  assert.ok(graph.nodes.some((n) => n.type === 'GiftCredit' && n.canonicalId === 'chg-pii'));
});

test('trail-only projection keeps Execution / Receipt / Verification / Impact NOT_COMPUTABLE', async () => {
  const svc = createService({ orgId: 'org_1', now: () => NOW });
  await svc.ingestEveryOrg({
    chargeId: 'chg-graph-4',
    amount: '25.00',
    netAmount: '25.00',
    currency: 'USD',
    donationDate: '2026-08-10T00:00:00Z',
    toNonprofit: { slug: 'x', name: 'X' },
  });
  const graph = await projectMissionGraphFromRecords({ trail: await svc.getTrail() });
  assert.equal(graph.status, 'PROJECTED');
  assert.ok(graph.nodes.some((n) => n.type === 'GiftCredit'));
  assert.ok(graph.nodes.some((n) => n.type === 'Pot'));
  for (const type of ['Execution', 'Receipt', 'Verification', 'Impact', 'LearningFeedback']) {
    assert.equal(graph.nodes.some((n) => n.type === type), false);
    assert.ok(graph.notComputable.some((item) => item.type === type && item.epistemic === 'NOT_COMPUTABLE'));
  }
});
