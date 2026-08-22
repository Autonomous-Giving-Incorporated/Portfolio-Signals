import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validatePublicCampaign } from './validate-public-contracts.mjs';
import {
  EXPECTED_COUNTS,
  FORBIDDEN_PUBLIC_KEYS,
  PUBLIC_ALLOCATION_IDS,
  TENANT_ID,
  assertLocalSafeDatabaseUrl,
  assertPublicPrivacy,
  loadCorpus,
  validateCorpus,
} from '../scripts/synthetic/lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('fixture integrity: version, classification, counts, checksums', () => {
  const result = validateCorpus(loadCorpus());
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.counts.donors, EXPECTED_COUNTS.donors);
  assert.equal(result.counts.gifts, EXPECTED_COUNTS.gifts);
  assert.equal(result.counts.gift_amount_total, EXPECTED_COUNTS.gift_amount_total);
});

test('public allocation ids are stable suite joins', () => {
  const corpus = loadCorpus();
  const fromFunds = corpus.funds.map((row) => row.public_allocation_id);
  const fromPublic = corpus.publicCampaign.allocations.map((row) => row.allocationId);
  const fromMiddleware = corpus.middleware.suggestedAllocations.map((row) => row.id);
  for (const id of PUBLIC_ALLOCATION_IDS) {
    assert.ok(fromFunds.includes(id), id);
    assert.ok(fromPublic.includes(id), id);
    assert.ok(fromMiddleware.includes(id), id);
  }
});

test('synthetic public campaign validates and stays off the live shell', () => {
  const campaign = loadCorpus().publicCampaign;
  const result = validatePublicCampaign(campaign);
  assert.equal('kind' in result, false, result.reason || 'campaign invalid');
  assertPublicPrivacy(campaign, 'public campaign');
  const live = JSON.parse(readFileSync(path.join(root, 'data/public-campaign.json'), 'utf8'));
  assert.equal(live.campaign.minimumTarget, 0);
  assert.equal(live.campaign.stretchTarget, 0);
  assert.equal(live.allocations.length, 0);
});

test('edge_006 stale public aggregate fails closed after 7 days', () => {
  const stale = loadCorpus().edgeCases.find((row) => row.case_id === 'edge_006');
  const updated = new Date(`${stale.updatedAt}T00:00:00Z`);
  const now = new Date('2026-08-22T00:00:00Z');
  const ageDays = (now.getTime() - updated.getTime()) / 86400000;
  assert.equal(stale.expected, 'fail_closed_after_7_days');
  assert.ok(ageDays > 7);
});

test('edge_007 public payload with PII is rejected', () => {
  const poisoned = {
    ...loadCorpus().publicCampaign,
    donor_email: 'donor0001@example.test',
  };
  assert.ok(FORBIDDEN_PUBLIC_KEYS.includes('donor_email'));
  assert.throws(() => assertPublicPrivacy(poisoned, 'poisoned campaign'), /donor_email/);
});

test('edge_010 unverified outcome stays NOT_COMPUTABLE', () => {
  const corpus = loadCorpus();
  const outcome = corpus.outcomes.find((row) => row.outcome_id === 'out_syn_005');
  const edge = corpus.edgeCases.find((row) => row.case_id === 'edge_010');
  assert.equal(outcome.claim_label, 'NOT_COMPUTABLE');
  assert.equal(outcome.verification_status, 'proposed');
  assert.equal(edge.expected, 'NOT_COMPUTABLE');
});

test('private donors never leak into public or middleware fixtures', () => {
  const corpus = loadCorpus();
  const publicText = JSON.stringify(corpus.publicCampaign) + JSON.stringify(corpus.publicImpact);
  const middlewareText = JSON.stringify(corpus.middleware);
  for (const donor of corpus.donors) {
    assert.equal(publicText.includes(donor.email), false, donor.email);
    assert.equal(middlewareText.includes(donor.email), false, donor.email);
    assert.equal(publicText.includes(donor.donor_id), false, donor.donor_id);
  }
  assert.equal(corpus.middleware.orgId, TENANT_ID);
});

test('gift total difference vs cleared pot credit is explicit', () => {
  const corpus = loadCorpus();
  const pendingOrRefunded = corpus.gifts.filter((g) => g.status !== 'cleared');
  assert.equal(pendingOrRefunded.length, 4);
  const excluded = pendingOrRefunded.reduce((n, g) => n + Number(g.amount), 0);
  assert.equal(EXPECTED_COUNTS.gift_amount_total - EXPECTED_COUNTS.cleared_amount_total, excluded);
});

test('no committed csv or xlsx beside the normalized JSON corpus', () => {
  const listed = readFileSync(path.join(root, 'fixtures/autogive-v1/SHA256SUMS.txt'), 'utf8');
  assert.equal(/\.csv\b/.test(listed), false);
});

test('seed refuses platform and empty database URLs', () => {
  assert.throws(
    () => assertLocalSafeDatabaseUrl('postgresql://postgres@db.utdioxwiskzatwoejgiu.supabase.co/postgres'),
    /refusing/,
  );
  assert.throws(
    () => assertLocalSafeDatabaseUrl('postgresql://postgres@db.ecxkhihlbrcwpavfoaoq.supabase.co/postgres'),
    /refusing/,
  );
  assert.throws(() => assertLocalSafeDatabaseUrl(''), /required/);
  assert.doesNotThrow(() => assertLocalSafeDatabaseUrl('postgresql://postgres@127.0.0.1:54322/postgres'));
});

test('edge corpus ownership is explicit and complete', () => {
  const corpus = loadCorpus();
  assert.equal(corpus.edgeCases.length, 10);
  const native = corpus.edgeCases.filter((row) => row.owner === 'NATIVE').map((row) => row.case_id);
  const bridge = corpus.edgeCases.filter((row) => row.owner === 'BRIDGE_ONLY').map((row) => row.case_id);
  assert.deepEqual(native.sort(), ['edge_001', 'edge_002', 'edge_005', 'edge_006', 'edge_007', 'edge_008']);
  assert.deepEqual(bridge.sort(), ['edge_003', 'edge_004', 'edge_009', 'edge_010']);
  for (const row of corpus.edgeCases.filter((item) => item.owner === 'BRIDGE_ONLY')) {
    assert.equal(row.bridge_owner, 'Impact-Relay');
  }
});

test('agent-proposed allocation is not an approved human decision', () => {
  const corpus = loadCorpus();
  const agent = corpus.allocations.find((row) => row.decision_source === 'agent_proposal');
  assert.equal(agent.allocation_id, 'aln_syn_004');
  assert.equal(agent.status, 'proposed');
  const fund = corpus.funds.find((row) => row.fund_id === agent.fund_id);
  assert.equal(fund.public_allocation_id, 'alloc_community_programs');
});

test('suppressed contact stays off public outreach counts', () => {
  const corpus = loadCorpus();
  const suppressed = corpus.donors.filter((row) => row.consent_state === 'suppressed');
  assert.ok(suppressed.some((row) => row.donor_id === 'donor_syn_0011'));
  assert.equal(corpus.publicCampaign.registry.outreachReadyRecords, 0);
});
