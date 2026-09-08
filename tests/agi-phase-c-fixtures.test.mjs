import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  isAllocationId,
  validatePublicCampaign,
  validatePublicImpact,
  validatePublicImpactNarrative,
} from './validate-public-contracts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(root, 'fixtures', 'agi_phase_c');

const FORBIDDEN_KEYS = new Set([
  'donor',
  'donor.name',
  'donorName',
  'donor_id',
  'donorId',
  'donorEmail',
  'donation_id',
  'donationId',
  'approved_by',
]);

const FORBIDDEN_TEXT = [/\bJane\b/, /donor\.name/, /Delivered to /];

const SPEC011_STAGES = [
  'Need',
  'Fund Intel Recommendation',
  'Human Approval',
  'Allocation',
  'Purchase',
  'Evidence',
  'Receipt',
  'Verification',
  'Impact',
  'Notification',
];

function load(rel) {
  return JSON.parse(readFileSync(path.join(fixtureDir, rel), 'utf8'));
}

function walkKeys(value, keys = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkKeys(item, keys));
    return keys;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      walkKeys(nested, keys);
    }
  }
  return keys;
}

function assertValid(result, label) {
  assert.equal('kind' in result, false, `${label}: ${result.reason || 'unexpected failure'}`);
}

test('canonical Community AI Lab campaign validates as public-campaign', () => {
  const campaign = load('canonical/public_campaign.json');
  const result = validatePublicCampaign(campaign);
  assertValid(result, 'canonical campaign');
  assert.equal(result.authority, 'advisory_only');
  assert.equal(result.allocations[0]?.allocationId, 'alloc_community_ai_lab');
  assert.equal(result.allocations[0]?.fundName, 'Community AI Lab equipment');
  assert.match(campaign.allocations[0].rationale, /25 laptops/);
  assert.match(campaign.allocations[0].rationale, /2500 USD/);
  assert.equal(campaign.campaign.minimumTarget, 0);
  assert.equal(campaign.campaign.stretchTarget, 0);
});

test('canonical Community AI Lab impact validates as public-impact', () => {
  const impact = load('canonical/public_impact.json');
  const result = validatePublicImpact(impact);
  assertValid(result, 'canonical impact');
  assert.equal(result.outcome.organizationName, 'Community AI Lab');
  assert.equal(result.outcome.participantsPublic, 25);
  assert.equal(result.outcome.allocationId, 'alloc_community_ai_lab');
  assert.equal(impact.source, 'fixture:agi_phase_c:canonical_community_ai_lab');
  assert.notEqual(result.outcome.organizationName, 'Hacker Dojo');
  assert.notEqual(result.outcome.participantsPublic, 18);
});

test('canonical narrative validates and keeps SPEC-011 event subsequence', () => {
  const narrative = load('canonical/narrative.json');
  const notes = load('canonical/spec011-notes.json');
  const result = validatePublicImpactNarrative(narrative);
  assertValid(result, 'canonical narrative');
  assert.equal(result.decision.allocationId, 'alloc_community_ai_lab');
  assert.deepEqual(
    result.events.map((event) => event.type),
    notes.narrativeEventSubsequence,
  );
  assert.deepEqual(notes.lifecycleOrder, SPEC011_STAGES);
  assert.equal(notes.need.quantity, 25);
  assert.equal(notes.need.item, 'laptops');
  assert.equal(notes.need.amount, 2500);
  assert.equal(notes.need.currency, 'USD');
  assert.equal(notes.money.agiProcessedDonation, false);
  assert.equal(notes.money.stripeDonation, false);
  assert.equal(notes.money.contactableDonor, false);
  assert.equal(notes.money.impactNoticeIssued, false);
  assert.equal(notes.money.giftTracked, true);
});

test('canonical fixtures join on alloc_community_ai_lab', () => {
  const campaign = load('canonical/public_campaign.json');
  const impact = load('canonical/public_impact.json');
  const narrative = load('canonical/narrative.json');
  const notes = load('canonical/spec011-notes.json');
  assert.equal(campaign.allocations[0].allocationId, notes.publicJoinAllocationId);
  assert.equal(impact.outcomes[0].allocationId, notes.publicJoinAllocationId);
  assert.equal(narrative.decision.allocationId, notes.publicJoinAllocationId);
  for (const event of narrative.events) {
    assert.equal(event.allocationId, notes.publicJoinAllocationId);
  }
});

test('SPEC-011 UUID allocationId is NOT_COMPUTABLE on public-campaign', () => {
  const notes = load('canonical/spec011-notes.json');
  const campaign = load('canonical/public_campaign.json');
  assert.equal(notes.spec011AllocationId, 'c6c2e191-3000-4000-8000-000000000001');
  assert.equal(isAllocationId(notes.spec011AllocationId), false);
  assert.equal(isAllocationId(notes.publicJoinAllocationId), true);
  assert.notEqual(campaign.allocations[0].allocationId, notes.spec011AllocationId);
  const uuidAsCampaign = {
    ...campaign,
    allocations: [
      {
        ...campaign.allocations[0],
        allocationId: notes.spec011AllocationId,
      },
    ],
  };
  const result = validatePublicCampaign(uuidAsCampaign);
  assert.equal(result.kind, 'malformed');
  assert.equal(result.reason, 'campaign.schema.allocations.allocationId');
  assert.ok(notes.notComputable.every((item) => item.status === 'NOT_COMPUTABLE'));
});

test('non-canonical Hacker Dojo fixtures stay labeled and validate', () => {
  const campaign = load('noncanonical/hacker-dojo-public-campaign.json');
  const impact = load('noncanonical/hacker-dojo-public-impact.json');
  const narrative = load('noncanonical/community-hardware-narrative.json');
  assertValid(validatePublicCampaign(campaign), 'hd campaign');
  assertValid(validatePublicImpact(impact), 'hd impact');
  assertValid(validatePublicImpactNarrative(narrative), 'hd narrative');
  assert.match(campaign.execution.reason, /noncanonical_hacker_dojo/);
  assert.match(campaign.gates[0].label, /Non-canonical/);
  assert.equal(impact.source, 'fixture:agi_phase_c:noncanonical_hacker_dojo');
  assert.equal(impact.outcomes[0].organizationName, 'Hacker Dojo');
  assert.equal(impact.outcomes[0].participantsPublic, 18);
  assert.equal(impact.outcomes[0].allocationId, 'alloc_community_hardware');
  assert.match(narrative.decision.rationale, /Non-canonical/);
  assert.notEqual(campaign.allocations[0].allocationId, 'alloc_community_ai_lab');
});

test('live public-campaign shell stays fail-closed and is not the C4 fixture', () => {
  const live = JSON.parse(readFileSync(path.join(root, 'data', 'public-campaign.json'), 'utf8'));
  const canonical = load('canonical/public_campaign.json');
  assertValid(validatePublicCampaign(live), 'live campaign');
  assert.equal(live.execution.state, 'blocked');
  assert.deepEqual(live.allocations, []);
  assert.notEqual(live.registry.qualification, canonical.registry.qualification);
  const blob = JSON.stringify(live);
  assert.equal(blob.includes('READY'), false);
  assert.equal(blob.includes('Community AI Lab'), false);
});

test('C4 fixtures contain no donor identity', () => {
  const docs = [
    load('canonical/public_campaign.json'),
    load('canonical/public_impact.json'),
    load('canonical/narrative.json'),
    load('canonical/spec011-notes.json'),
    load('noncanonical/hacker-dojo-public-campaign.json'),
    load('noncanonical/hacker-dojo-public-impact.json'),
    load('noncanonical/community-hardware-narrative.json'),
  ];
  for (const doc of docs) {
    for (const key of walkKeys(doc)) {
      assert.equal(FORBIDDEN_KEYS.has(key), false, key);
    }
    const blob = JSON.stringify(doc);
    for (const pattern of FORBIDDEN_TEXT) {
      assert.equal(pattern.test(blob), false, String(pattern));
    }
  }
});
