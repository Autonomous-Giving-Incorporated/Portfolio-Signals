import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { toPortableScaffold } from '../../../scripts/staging/ir-portable-contract.mjs';
const fixture = JSON.parse(readFileSync(new URL('../../../fixtures/ir-portable/fi-empty-v1.json', import.meta.url), 'utf8'));

test('FI pinned legacy bytes convert to actual IR portable/reopen golden vector', () => {
  const before = JSON.stringify(fixture.record);
  const actual = toPortableScaffold(fixture.record);
  assert.equal(actual, fixture.portable_json);
  assert.equal(JSON.stringify(fixture.record), before);
  const artifact = JSON.parse(actual);
  assert.equal(artifact.policy_sha256, createHash('sha256').update(JSON.stringify(artifact.policy)).digest('hex'));
  assert.deepEqual(artifact.readiness, { operational: false, scaffold_verified: false });
});

test('adapter rejects altered policy, noncanonical bytes, identity and readiness', () => {
  for (const record of [
    { ...fixture.record, tenant_id: 'org_foreign' },
    { ...fixture.record, client_id: 'org_ir_http\n' },
    { ...fixture.record, idempotency_key: 'not-a-uuid' },
    { ...fixture.record, idempotency_key: fixture.record.idempotency_key + '\n' },
    { ...fixture.record, runtime_ready: true },
    { ...fixture.record, state: 'requested' },
    { ...fixture.record, policy_json: fixture.record.policy_json + '\n' },
    { ...fixture.record, policy_json: fixture.record.policy_json.replace('0.75', '0.750001') },
    { ...fixture.record, policy_json: fixture.record.policy_json.replace('"source_path":null', '"source_path":"file:unapproved"') },
    { ...fixture.record, policy_json: fixture.record.policy_json.replace('"require_donor_visible":true', '"require_donor_visible":false') },
    { ...fixture.record, policy_json: fixture.record.policy_json.replace('"send_notification",', '') },
    { ...fixture.record, policy_json: fixture.record.policy_json.replace('ir-policy-v1', 'ir-portable-policy-v1') },
  ]) assert.throws(() => toPortableScaffold(record), /invalid_fi_scaffold/);
});

test('literal tenant substitution and request binding work without normalizing', () => {
  const record = { ...fixture.record, client_id: 'org_other', tenant_id: 'org_other',
    policy_json: fixture.record.policy_json.replaceAll('org_ir_http', 'org_other'),
    idempotency_key: '11111111-1111-4111-8111-111111111111' };
  const artifact = JSON.parse(toPortableScaffold(record));
  assert.equal(artifact.tenant_id, record.client_id);
  assert.equal(artifact.policy.policy.tenant_id, record.client_id);
  assert.equal(artifact.idempotency_key, record.idempotency_key);
  assert.notEqual(artifact.policy_sha256, JSON.parse(fixture.portable_json).policy_sha256);
});
