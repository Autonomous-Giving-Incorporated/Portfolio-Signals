/**
 * AutoGive Synthetic Dataset v1 — shared loader and fail-closed checks.
 * SYNTHETIC_ONLY. Never label OBSERVED.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '../..');
export const FIXTURE_ROOT = path.join(REPO_ROOT, 'fixtures/autogive-v1');

export const DATASET = 'autogive-synthetic-dataset';
export const VERSION = '1.0.0';
export const SEED = 20260821;
export const CLASSIFICATION = 'SYNTHETIC_ONLY';
export const TENANT_ID = 'org_synthetic_civic_forge';
export const TENANT_SLUG = 'synthetic-civic-forge';
export const CAMPAIGN_ID = 'cmp_synthetic_builder_fund_2026';

export const PUBLIC_ALLOCATION_IDS = Object.freeze([
  'alloc_community_hardware',
  'alloc_access_scholarships',
  'alloc_facility_resilience',
  'alloc_community_programs',
]);

export const EXPECTED_COUNTS = Object.freeze({
  donors: 100,
  gifts: 438,
  gift_amount_total: 286450,
  cleared_gifts: 434,
  cleared_amount_total: 283990,
  funds: 4,
  allocations: 4,
  expenses: 8,
  programs: 3,
  outcomes: 5,
  roles: 6,
  edge_cases: 10,
});

export const ROLE_MAP = Object.freeze({
  director: { appRole: 'director', uuid: '00000000-0000-0000-0821-000000000001' },
  finance_approver: { appRole: 'director', uuid: '00000000-0000-0000-0821-000000000002' },
  program_manager: { appRole: 'campaign_lead', uuid: '00000000-0000-0000-0821-000000000003' },
  evidence_reviewer: { appRole: 'data_steward', uuid: '00000000-0000-0000-0821-000000000004' },
  analyst: { appRole: 'development', uuid: '00000000-0000-0000-0821-000000000005' },
  viewer: { appRole: 'board_viewer', uuid: '00000000-0000-0000-0821-000000000006' },
});

export const FUND_PROGRAM = Object.freeze({
  fund_001: 'community-hardware-fund',
  fund_002: 'access-scholarships',
  fund_003: 'facility-resilience',
  fund_004: 'community-programs',
});

export const CONSENT_MAP = Object.freeze({
  granted: 'confirmed',
  suppressed: 'suppressed',
  restricted: 'restricted',
  unknown: 'unknown',
});

export const FORBIDDEN_PRODUCTION_REFS = Object.freeze([
  'utdioxwiskzatwoejgiu',
  'ecxkhihlbrcwpavfoaoq',
]);

export const FORBIDDEN_PUBLIC_KEYS = Object.freeze([
  'donor',
  'donorName',
  'donor_id',
  'donorId',
  'donorEmail',
  'donor_email',
  'email',
  'phone',
  'address',
]);

export const FORBIDDEN_TEXT = Object.freeze([
  /@gmail\.com/i,
  /@yahoo\.com/i,
]);

const OBSERVED_LABEL_KEYS = new Set([
  'provenance',
  'claim_label',
  'raisedClaimLabel',
  'raisedSource',
  'classification',
  'evidenceState',
  'verification_status',
]);

const DATA_FILES = [
  'manifest.json',
  'provenance.json',
  'public/portfolio-signals-public-campaign.json',
  'private/roles.json',
  'private/funds.json',
  'private/donors.json',
  'private/gifts.json',
  'private/allocations.json',
  'bridge/evidence.json',
  'bridge/expenses.json',
  'bridge/programs.json',
  'bridge/expense_program_links.json',
  'bridge/outcomes.json',
  'bridge/impact-relay-public-impact.json',
  'edge_cases/acceptance-corpus.json',
  'middleware/pilot.json',
];

export function readJson(rel) {
  return JSON.parse(readFileSync(path.join(FIXTURE_ROOT, rel), 'utf8'));
}

export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function loadCorpus() {
  return {
    manifest: readJson('manifest.json'),
    provenance: readJson('provenance.json'),
    publicCampaign: readJson('public/portfolio-signals-public-campaign.json'),
    roles: readJson('private/roles.json'),
    funds: readJson('private/funds.json'),
    donors: readJson('private/donors.json'),
    gifts: readJson('private/gifts.json'),
    allocations: readJson('private/allocations.json'),
    evidence: readJson('bridge/evidence.json'),
    expenses: readJson('bridge/expenses.json'),
    programs: readJson('bridge/programs.json'),
    links: readJson('bridge/expense_program_links.json'),
    outcomes: readJson('bridge/outcomes.json'),
    publicImpact: readJson('bridge/impact-relay-public-impact.json'),
    edgeCases: readJson('edge_cases/acceptance-corpus.json'),
    middleware: readJson('middleware/pilot.json'),
  };
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

export function assertNoObserved(value, label) {
  if (typeof value === 'string') {
    if (value.trim() === 'OBSERVED') {
      throw new Error(`${label} is labeled OBSERVED`);
    }
    return;
  }
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, nested] of Object.entries(node)) {
      if (key === 'never_label' || key === 'safety_rules') continue;
      if (OBSERVED_LABEL_KEYS.has(key) && nested === 'OBSERVED') {
        throw new Error(`${label}${path}.${key} is labeled OBSERVED`);
      }
      if (typeof nested === 'string' && nested.trim() === 'OBSERVED' && key !== 'description') {
        throw new Error(`${label}${path}.${key} is labeled OBSERVED`);
      }
      walk(nested, `${path}.${key}`);
    }
  };
  walk(value, '');
}

export function assertPublicPrivacy(doc, label) {
  const keys = walkKeys(doc);
  for (const key of keys) {
    if (FORBIDDEN_PUBLIC_KEYS.includes(key)) {
      throw new Error(`${label} exposes forbidden public key ${key}`);
    }
  }
  const text = JSON.stringify(doc);
  for (const re of FORBIDDEN_TEXT) {
    if (re.test(text)) {
      throw new Error(`${label} matches forbidden public pattern ${re}`);
    }
  }
  if (/\bOBSERVED\b/.test(text)) {
    throw new Error(`${label} contains forbidden OBSERVED claim`);
  }
  assertNoObserved(doc, label);
}

export function validateCorpus(corpus = loadCorpus()) {
  const errors = [];
  const { manifest, provenance } = corpus;

  if (manifest.dataset !== DATASET) errors.push(`dataset ${manifest.dataset}`);
  if (manifest.version !== VERSION) errors.push(`version ${manifest.version}`);
  if (manifest.seed !== SEED) errors.push(`seed ${manifest.seed}`);
  if (manifest.classification !== CLASSIFICATION) {
    errors.push(`classification ${manifest.classification}`);
  }
  if (manifest.tenantId !== TENANT_ID) errors.push(`tenant ${manifest.tenantId}`);
  if (manifest.campaignId !== CAMPAIGN_ID) errors.push(`campaign ${manifest.campaignId}`);
  if (provenance.classification !== CLASSIFICATION) {
    errors.push(`provenance classification ${provenance.classification}`);
  }

  const counts = {
    donors: corpus.donors.length,
    gifts: corpus.gifts.length,
    gift_amount_total: corpus.gifts.reduce((n, g) => n + Number(g.amount), 0),
    cleared_gifts: corpus.gifts.filter((g) => g.status === 'cleared').length,
    cleared_amount_total: corpus.gifts
      .filter((g) => g.status === 'cleared')
      .reduce((n, g) => n + Number(g.amount), 0),
    funds: corpus.funds.length,
    allocations: corpus.allocations.length,
    expenses: corpus.expenses.length,
    programs: corpus.programs.length,
    outcomes: corpus.outcomes.length,
    roles: corpus.roles.length,
    edge_cases: corpus.edgeCases.length,
  };

  for (const [key, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (counts[key] !== expected) {
      errors.push(`count ${key}: got ${counts[key]} expected ${expected}`);
    }
  }

  const allocIds = corpus.funds.map((f) => f.public_allocation_id);
  for (const id of PUBLIC_ALLOCATION_IDS) {
    if (!allocIds.includes(id)) errors.push(`missing public allocation ${id}`);
  }

  const donorIds = new Set(corpus.donors.map((d) => d.donor_id));
  const fundIds = new Set(corpus.funds.map((f) => f.fund_id));
  for (const gift of corpus.gifts) {
    if (gift.tenant_id !== TENANT_ID) errors.push(`gift tenant ${gift.gift_id}`);
    if (gift.processor !== 'fixture') errors.push(`gift ${gift.gift_id} processor not fixture`);
    if (gift.provenance !== 'SYNTHETIC') errors.push(`gift ${gift.gift_id} provenance`);
    if (!donorIds.has(gift.donor_id)) errors.push(`gift ${gift.gift_id} missing donor`);
    if (gift.restricted_fund_id && !fundIds.has(gift.restricted_fund_id)) {
      errors.push(`gift ${gift.gift_id} missing fund`);
    }
    if (!String(gift.gift_id).startsWith('gift_syn_')) errors.push(`unstable gift id ${gift.gift_id}`);
  }

  for (const donor of corpus.donors) {
    if (!/@example\.(test|org)$/i.test(donor.email)) {
      errors.push(`donor ${donor.donor_id} email not reserved test domain`);
    }
    if (donor.provenance !== 'SYNTHETIC') errors.push(`donor ${donor.donor_id} provenance`);
  }

  for (const role of corpus.roles) {
    if (!ROLE_MAP[role.role]) errors.push(`unmapped role ${role.role}`);
    if (!/@example\.(test|org)$/i.test(role.email)) errors.push(`role email ${role.email}`);
  }

  try {
    assertPublicPrivacy(corpus.publicCampaign, 'public campaign');
  } catch (err) {
    errors.push(err.message);
  }
  try {
    assertPublicPrivacy(corpus.publicImpact, 'public impact');
  } catch (err) {
    errors.push(err.message);
  }
  try {
    assertNoObserved(corpus, 'corpus');
  } catch (err) {
    errors.push(err.message);
  }

  if (corpus.publicImpact.campaign?.raisedSource !== 'pilot_synthetic') {
    errors.push('public impact raisedSource must stay pilot_synthetic');
  }
  if (corpus.publicImpact.campaign?.raisedClaimLabel === 'OBSERVED') {
    errors.push('public impact raisedClaimLabel is OBSERVED');
  }

  const sums = corpus.SHA256SUMS || readFileSync(path.join(FIXTURE_ROOT, 'SHA256SUMS.txt'), 'utf8');
  const listed = new Map();
  for (const line of sums.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [digest, rel] = trimmed.split(/\s+/, 2);
    listed.set(rel, digest);
  }
  for (const rel of DATA_FILES) {
    const abs = path.join(FIXTURE_ROOT, rel);
    const digest = sha256(readFileSync(abs));
    if (listed.get(rel) !== digest) {
      errors.push(`checksum mismatch ${rel}`);
    }
  }

  if (corpus.middleware.orgId !== TENANT_ID) errors.push('middleware orgId');
  if (corpus.middleware.source !== 'fixture') errors.push('middleware source');
  for (const gift of corpus.middleware.gifts) {
    if (!/^fixture-/i.test(gift.chargeId)) {
      errors.push(`middleware chargeId not fixture-prefixed: ${gift.chargeId}`);
    }
    if (gift.email || gift.donor_id || gift.donorId) {
      errors.push(`middleware gift leaked donor identity ${gift.chargeId}`);
    }
  }

  return { ok: errors.length === 0, errors, counts };
}

export function assertLocalSafeDatabaseUrl(url) {
  const value = String(url || '');
  if (!value) throw new Error('DB_URL is required for seed:synthetic');
  for (const ref of FORBIDDEN_PRODUCTION_REFS) {
    if (value.includes(ref)) {
      throw new Error(`refusing to seed production/legacy ref ${ref}`);
    }
  }
  const local =
    /localhost|127\.0\.0\.1|0\.0\.0\.0|@db:|supabase_db_/i.test(value) ||
    process.env.SYNTHETIC_ALLOW_NONLOCAL === '1';
  if (!local) {
    throw new Error('refusing non-local DB_URL (set SYNTHETIC_ALLOW_NONLOCAL=1 only for isolated projects)');
  }
}

export function writeChecksums() {
  const lines = DATA_FILES.map((rel) => `${sha256(readFileSync(path.join(FIXTURE_ROOT, rel)))}  ${rel}`);
  const body = `${lines.join('\n')}\n`;
  writeFileSync(path.join(FIXTURE_ROOT, 'SHA256SUMS.txt'), body);
  return DATA_FILES.slice();
}

export function listFixtureFiles(dir = FIXTURE_ROOT, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) listFixtureFiles(full, acc);
    else acc.push(path.relative(FIXTURE_ROOT, full));
  }
  return acc;
}
