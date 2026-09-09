// Request → reservation → read-only initialized storage; never activates IR money execution.
// Override strings through runtime config irProvisioningMessages for localization.
import { canonical, validWorkspace } from './ir-workspace-contract.mjs';
const MESSAGES = Object.freeze({
  title: 'Impact Relay provisioning requests',
  scope: 'For existing clients only. Records a private request, not a policy clone or an operational IR workspace. No activation, document-readiness or tenant-isolation claim. After recording a request, explicitly persist an empty scaffold (reservation), then initialize and open a read-only workspace. This does not start runtime operations.',
  client: 'Existing client for IR request',
  choose: 'Choose an existing client',
  rationale: 'IR request rationale',
  request: 'Request IR provisioning',
  check: 'Check request status',
  idle: 'Select a client to request provisioning or read its request status.',
  busy: 'Checking private provisioning request…',
  recorded: 'Request recorded.',
  replayed: 'Existing request replayed.',
  found: 'Existing request found.',
  absent: 'No provisioning request recorded for this client.',
  readiness: 'Runtime readiness: not established. Runtime binding, operational policy approval and isolation remain unverified; no ledger, finance or notifications are enabled.',
  unavailable: 'Provisioning request service unavailable or access denied. No readiness established. Check status before retrying; a retry of unchanged inputs uses the same request key. No CLI fallback is available.',
  conflict: 'Request conflict. Check the existing request status; no request was overwritten.',
  invalid: 'Choose an eligible existing client and provide a rationale of 12–2000 characters.',
  operation: 'Operation',
  clientId: 'Client / tenant',
  execute: 'Persist empty IR scaffold',
  scaffoldCheck: 'Check scaffold status',
  scaffoldFound: 'Reserved: Empty scaffold persisted. Reservation is not initialization; open workspace status to verify. Not operational.',
  initialize: 'Initialize empty IR workspace',
  openWorkspace: 'Open initialized IR workspace',
  initialized: 'Initialized: canonical tenant, portable policy and empty ledger binding verified.',
  emptyLedger: 'Persisted ledger commands: 0; entities: 0; outbox events: 0.',
  operationalNo: 'Operational: no. Read-only storage core; money execution, publication and notifications are unavailable. No activation or document-readiness granted.',
  workspaceAbsent: 'Not initialized. Reserve an empty scaffold, then initialize the read-only workspace.',
  policyHash: 'Policy SHA-256',
  scaffoldAbsent: 'No empty scaffold persisted. Record a request before execution.'
});

export function mountIrProvisioning(container, { supabase, clients = [], messages = {} } = {}) {
  const t = key => typeof messages[key] === 'string' ? messages[key] : MESSAGES[key];
  // Build labels/options as text, including administrator-controlled client names.
  container.innerHTML = '<h3></h3><p class="note" data-scope></p><form class="control-grid"><label data-client-label><select required name="irClient"></select></label><label data-rationale-label><textarea name="irRationale" required minlength="12" maxlength="2000"></textarea></label><button class="button" type="submit"></button><button class="button secondary" type="button" data-check></button></form><p id="irRequestStatus" class="note" role="status" aria-live="polite" aria-atomic="true" tabindex="-1"></p>';
  container.querySelector('h3').textContent = t('title');
  container.querySelector('[data-scope]').textContent = t('scope');
  container.querySelector('[data-client-label]').prepend(document.createTextNode(t('client')));
  container.querySelector('[data-rationale-label]').prepend(document.createTextNode(t('rationale')));
  const form = container.querySelector('form');
  const select = form.elements.irClient;
  const rationale = form.elements.irRationale;
  const submit = form.querySelector('[type=submit]');
  const check = form.querySelector('[data-check]');
  const status = container.querySelector('#irRequestStatus');
  const execute = document.createElement('button');
  const scaffoldCheck = document.createElement('button');
  const initialize = document.createElement('button');
  const openWorkspace = document.createElement('button');
  for (const [button, label] of [[execute, 'execute'], [scaffoldCheck, 'scaffoldCheck'], [initialize, 'initialize'], [openWorkspace, 'openWorkspace']]) {
    button.type = 'button'; button.className = 'button secondary'; button.textContent = t(label); form.append(button);
  }
  submit.textContent = t('request');
  check.textContent = t('check');
  select.add(new Option(t('choose'), ''));
  for (const client of clients) {
    if (/^org_[a-z0-9_]+$/.test(client.id)) {
      const option = new Option(`${client.display_name} · ${client.id}`, client.id);
      option.dataset.eligible = String(['provisioning', 'active'].includes(client.state));
      select.add(option);
    }
  }
  status.textContent = t('idle');
  let busy = false;
  const keys = new Map();
  const payloadKey = (clientId, reason) => JSON.stringify([clientId, reason]);
  // PostgreSQL UUID wire form; reject malformed identities without normalizing.
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const validRecord = (record, clientId) => record?.client_id === clientId && record?.tenant_id === clientId
    && record.state === 'requested' && record.runtime_ready === false
    && typeof record.operation_id === 'string' && uuidPattern.test(record.operation_id)
    && typeof record.idempotency_key === 'string' && uuidPattern.test(record.idempotency_key)
    && typeof record.rationale === 'string';

  async function run(write) {
    if (busy) return;
    const clientId = select.value;
    const reason = rationale.value;
    if (!clientId || (write && (select.selectedOptions[0]?.dataset.eligible !== 'true'
      || reason.trim().length < 12 || reason.trim().length > 2000))) {
      status.textContent = t('invalid');
      return;
    }
    busy = true;
    for (const control of [submit, check, execute, scaffoldCheck, initialize, openWorkspace, select, rationale]) control.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = t('busy');
    status.classList.remove('error');
    try {
      let result;
      if (write) {
        const key = payloadKey(clientId, reason);
        if (!keys.has(key)) keys.set(key, crypto.randomUUID());
        const { data, error } = await supabase.rpc('request_ir_provisioning', {
          p_client_id: clientId, p_idempotency_key: keys.get(key), p_rationale: reason
        });
        if (error) throw error;
        if (!validRecord(data, clientId) || data.idempotency_key !== keys.get(key) || data.rationale !== reason) {
          throw new Error('invalid_request_response');
        }
        result = data;
      }
      // A write response alone is insufficient: read the exact target back.
      const { data, error } = await supabase.rpc('get_ir_provisioning_request', { p_client_id: clientId });
      if (error) throw error;
      if (data === null && !write) {
        status.textContent = `${t('absent')} ${t('readiness')}`;
        return;
      }
      if (!validRecord(data, clientId) || (write && (data.operation_id !== result.operation_id
        || data.idempotency_key !== result.idempotency_key || data.rationale !== result.rationale))) {
        throw new Error('invalid_status_response');
      }
      keys.set(payloadKey(clientId, data.rationale), data.idempotency_key);
      status.textContent = `${t(write ? (result.replayed ? 'replayed' : 'recorded') : 'found')} ${t('clientId')}: ${clientId}. ${t('operation')}: ${data.operation_id}. ${t('readiness')}`;
    } catch (error) {
      status.classList.add('error');
      status.textContent = t(['idempotency_conflict', 'client_request_conflict'].includes(error?.message) ? 'conflict' : 'unavailable');
    } finally {
      busy = false;
      for (const control of [submit, check, execute, scaffoldCheck, initialize, openWorkspace, select, rationale]) control.disabled = false;
      form.setAttribute('aria-busy', 'false');
    }
  }
  async function runScaffold(write) {
    if (busy) return;
    const clientId = select.value;
    if (!clientId || (write && select.selectedOptions[0]?.dataset.eligible !== 'true')) {
      status.textContent = t('invalid'); return;
    }
    busy = true;
    for (const control of [submit, check, execute, scaffoldCheck, initialize, openWorkspace, select, rationale]) control.disabled = true;
    form.setAttribute('aria-busy', 'true'); status.textContent = t('busy'); status.classList.remove('error');
    try {
      let operation;
      if (write) {
        const { data, error } = await supabase.rpc('get_ir_provisioning_request', { p_client_id: clientId });
        if (error || !validRecord(data, clientId)) throw new Error('request_required');
        operation = data.operation_id;
      }
      const session = await supabase.auth.getSession();
      const token = session.data?.session?.access_token;
      if (session.error || !token) throw new Error('session_required');
      const response = await fetch(`/api/ir/provisioning/${clientId}`, {
        method: write ? 'POST' : 'GET', cache: 'no-store', redirect: 'error',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(write ? { body: JSON.stringify({ operation_id: operation }) } : {})
      });
      if (!response.ok) throw new Error('scaffold_unavailable');
      const { scaffold } = await response.json();
      if (scaffold === null && !write) { status.textContent = `${t('scaffoldAbsent')} ${t('readiness')}`; return; }
      const policy = JSON.parse(scaffold?.policy_json);
      if (scaffold.client_id !== clientId || scaffold.tenant_id !== clientId
        || scaffold.runtime_ready !== false || scaffold.state !== 'scaffold_persisted'
        || !uuidPattern.test(scaffold.operation_id) || (write && scaffold.operation_id !== operation)
        || policy.format !== 'ir-policy-v1' || policy.policy?.tenant_id !== clientId
        || policy.policy?.version !== 'fi-empty-v1') throw new Error('invalid_scaffold');
      status.textContent = `${t('scaffoldFound')} ${t('clientId')}: ${clientId}. ${t('operation')}: ${scaffold.operation_id}. ${t('readiness')}`;
    } catch {
      status.classList.add('error'); status.textContent = t('unavailable');
    } finally {
      busy = false;
      for (const control of [submit, check, execute, scaffoldCheck, initialize, openWorkspace, select, rationale]) control.disabled = false;
      form.setAttribute('aria-busy', 'false');
    }
  }
  async function runWorkspace(write) {
    if (busy) return;
    const clientId = select.value;
    if (!clientId || (write && select.selectedOptions[0]?.dataset.eligible !== 'true')) {
      status.textContent = t('invalid'); return;
    }
    busy = true;
    const controls = [submit, check, execute, scaffoldCheck, initialize, openWorkspace, select, rationale];
    controls.forEach(control => { control.disabled = true; });
    form.setAttribute('aria-busy', 'true'); status.textContent = t('busy'); status.classList.remove('error');
    try {
      let operation;
      if (write) {
        const { data, error } = await supabase.rpc('get_ir_provisioning_request', { p_client_id: clientId });
        if (error || !validRecord(data, clientId)) throw new Error('request_required');
        operation = data.operation_id;
      }
      const session = await supabase.auth.getSession();
      const token = session.data?.session?.access_token;
      if (session.error || !token) throw new Error('session_required');
      const fetchWorkspace = async method => {
        const response = await fetch(`/api/ir/workspaces/${clientId}`, {
          method, cache: 'no-store', redirect: 'error',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          ...(method === 'POST' ? { body: JSON.stringify({ operation_id: operation }) } : {})
        });
        if (!response.ok) throw new Error('workspace_unavailable');
        return (await response.json()).workspace;
      };
      const written = write ? await fetchWorkspace('POST') : null;
      const workspace = await fetchWorkspace('GET');
      if (workspace === null && !write) { status.textContent = t('workspaceAbsent'); return; }
      if (!await validWorkspace(workspace, clientId, operation)
        || (write && canonical(written) !== canonical(workspace))) throw new Error('invalid_workspace');
      status.textContent = `${t('initialized')} ${t('clientId')}: ${clientId}. ${t('operation')}: ${workspace.operation_id}. ${t('emptyLedger')} ${t('policyHash')}: ${workspace.policy_sha256}. ${t('operationalNo')}`;
    } catch {
      status.classList.add('error'); status.textContent = t('unavailable');
    } finally {
      busy = false; controls.forEach(control => { control.disabled = false; }); form.setAttribute('aria-busy', 'false');
    }
  }
  initialize.addEventListener('click', () => { void runWorkspace(true); });
  openWorkspace.addEventListener('click', () => { void runWorkspace(false); });
  execute.addEventListener('click', () => { void runScaffold(true); });
  scaffoldCheck.addEventListener('click', () => { void runScaffold(false); });
  form.addEventListener('submit', event => { event.preventDefault(); void run(true); });
  check.addEventListener('click', () => { void run(false); });
  select.addEventListener('change', () => { status.textContent = t('idle'); status.classList.remove('error'); });
}
