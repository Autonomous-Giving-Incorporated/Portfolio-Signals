#!/usr/bin/env node
/**
 * Prove the synthetic public campaign conforms to schemas/public-campaign.schema.json.
 * Does not overwrite data/public-campaign.json (live fail-closed shell).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FIXTURE_ROOT, REPO_ROOT, assertPublicPrivacy, readJson } from './lib.mjs';

const campaign = readJson('public/portfolio-signals-public-campaign.json');
assertPublicPrivacy(campaign, 'synthetic public campaign');

if (campaign.authority !== 'advisory_only') {
  throw new Error('synthetic public campaign must remain advisory_only');
}
if (campaign.privacy?.piiAllowed !== false) {
  throw new Error('synthetic public campaign must set piiAllowed=false');
}

const live = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data/public-campaign.json'), 'utf8'));
if (live.campaign?.minimumTarget !== 0 || live.campaign?.stretchTarget !== 0) {
  console.warn('note: live data/public-campaign.json is not the fail-closed zero-target shell');
}

const schema = path.join(REPO_ROOT, 'schemas/public-campaign.schema.json');
const data = path.join(FIXTURE_ROOT, 'public/portfolio-signals-public-campaign.json');
const ajv = spawnSync(
  'npx',
  [
    '--yes',
    '--package=ajv-cli@5',
    '--package=ajv-formats@3',
    'ajv',
    'validate',
    '--spec=draft2020',
    '-c',
    'ajv-formats',
    '-s',
    schema,
    '-d',
    data,
  ],
  { cwd: REPO_ROOT, encoding: 'utf8' },
);
if (ajv.status !== 0) {
  process.stderr.write(ajv.stdout || '');
  process.stderr.write(ajv.stderr || '');
  process.exit(ajv.status || 1);
}
console.log(
  JSON.stringify(
    {
      ok: true,
      validated: 'fixtures/autogive-v1/public/portfolio-signals-public-campaign.json',
      livePublicCampaignUntouched: true,
      allocationIds: campaign.allocations.map((row) => row.allocationId),
    },
    null,
    2,
  ),
);
