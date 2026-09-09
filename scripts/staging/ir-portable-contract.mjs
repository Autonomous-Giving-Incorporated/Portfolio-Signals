// Local conformance adapter ONLY for FI's immutable fi-empty-v1 template.
// Not a runtime importer, general ir-policy-v1 codec, or authorization boundary.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const golden = JSON.parse(readFileSync(new URL('../../fixtures/ir-portable/fi-empty-v1.json', import.meta.url), 'utf8'));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function toPortableScaffold(record) {
  const client = record?.client_id;
  if (typeof client !== 'string' || !/^org_[a-z0-9_]+$/.test(client) || client.length > 128
    || record.tenant_id !== client || record.state !== 'scaffold_persisted'
    || record.runtime_ready !== false || typeof record.idempotency_key !== 'string'
    || !uuid.test(record.idempotency_key)
    || record.policy_json !== golden.record.policy_json.replaceAll(golden.record.client_id, client)) {
    throw new Error('invalid_fi_scaffold');
  }
  // Exact byte allowlist above excludes arbitrary policies, Unicode/numeric codec
  // differences, duplicates and weakened gates. Never generalize by relabeling.
  const policy = JSON.parse(record.policy_json);
  policy.format = 'ir-portable-policy-v1';
  policy.policy.confidence = { block_below: '0.75', recommend_high: '0.95' };
  // Pinned input keys already have canonical ASCII order; preserve every array.
  const policyJson = JSON.stringify(policy);
  return JSON.stringify({
    empty_state: { entities: [], ledger_commands: [], outbox_events: [] },
    format: 'ir-empty-scaffold-v1',
    idempotency_key: record.idempotency_key,
    policy,
    policy_sha256: createHash('sha256').update(policyJson, 'utf8').digest('hex'),
    readiness: { operational: false, scaffold_verified: false },
    tenant_id: client,
  });
}
