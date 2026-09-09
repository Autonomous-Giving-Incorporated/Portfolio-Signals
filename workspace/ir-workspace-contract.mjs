// Read-only initialized storage core, NOT an IR financial command executor.
// Only the pinned inert template is supported. No arbitrary policy importing.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const POLICY = '{"format":"ir-portable-policy-v1","policy":{"attribution":{"allowed_methods":[],"default_method":"DIRECT_RESTRICTED"},"authority":{"l3_command_types":["approve_expense","reject_expense","publish_use_of_funds_receipt","send_notification","publish_public_evidence","change_attribution_policy","correct_published_amount","reverse_expense","supersede_expense"]},"confidence":{"block_below":"0.75","recommend_high":"0.95"},"display_name":"TENANT","evidence":{"require_donor_visible":true,"sufficient_kinds":["invoice","receipt","accounting_ref"]},"notifications":{"default_email_topics":[],"fixture_consent_allowed":false,"require_separate_send_approval":true},"source_path":null,"tenant_id":"TENANT","version":"fi-empty-v1"}}';
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function sha256(text) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');
}
/** Export validated FI genesis readback, not a storage-verification receipt.
 * The caller supplies the independently selected tenant/request binding.
 * FI scaffold arrays stay arrays; only proven-empty genesis gets IR entity maps.
 * No arbitrary policies, populated ledgers, runtime activation or evidence claims.
 */
export async function toPortableInitializedWorkspace(value, { client, operation, idempotencyKey } = {}) {
  if (typeof client !== 'string' || !/^org_[a-z0-9_]+$/.test(client) || client.length > 128
    || typeof operation !== 'string' || !UUID.test(operation)
    || typeof idempotencyKey !== 'string' || !UUID.test(idempotencyKey)
    || value?.idempotency_key !== idempotencyKey
    || !await validWorkspace(value, client, operation)) throw new Error('invalid_fi_initialized_workspace');
  const entities = Object.fromEntries([
    'donors', 'donations', 'allocations', 'donation_allocations', 'expenses',
    'expense_allocations', 'evidence', 'attributions', 'receipts',
    'receipt_snapshots', 'expense_receipts', 'external_index',
  ].map(name => [name, {}]));
  entities.organization = { ...value.organization };
  return canonical({
    format: 'ir-initialized-empty-workspace-v1',
    scaffold: JSON.parse(value.portable_json),
    ledger_binding: { format: 'ir-empty-ledger-binding-v1', tenant_id: client, entities },
    operational: false,
  });
}

export async function validWorkspace(value, client, operation) {
  if (!value || value.client_id !== client || value.tenant_id !== client
    || value.state !== 'initialized' || value.storage_version !== 'fi-ir-readonly-v1'
    || value.runtime_ready !== false || value.operational !== false || value.ledger_revision !== 0
    || !UUID.test(value.operation_id) || !UUID.test(value.idempotency_key)
    || !UUID.test(value.initialized_by) || value.policy_created_by !== value.initialized_by
    || typeof value.initialized_at !== 'string' || !Number.isFinite(Date.parse(value.initialized_at))
    || typeof value.policy_created_at !== 'string' || !Number.isFinite(Date.parse(value.policy_created_at))
    || value.provenance !== 'fi-empty-v1:202609080003'
    || (operation && value.operation_id !== operation)) return false;
  const policyJson = POLICY.replaceAll('TENANT', client);
  const policyHash = await sha256(policyJson);
  const emptyState = { entities: [], ledger_commands: [], outbox_events: [] };
  const portableJson = canonical({ empty_state: emptyState, format: 'ir-empty-scaffold-v1',
    idempotency_key: value.idempotency_key, policy: JSON.parse(policyJson), policy_sha256: policyHash,
    readiness: { operational: false, scaffold_verified: false }, tenant_id: client });
  return value.policy_json === policyJson && value.policy_sha256 === policyHash
    && value.portable_json === portableJson && value.artifact_sha256 === await sha256(portableJson)
    && canonical(value.empty_state) === canonical(emptyState)
    && canonical(value.organization) === canonical({ id: client, name: client, policy_version: 'fi-empty-v1' });
}
