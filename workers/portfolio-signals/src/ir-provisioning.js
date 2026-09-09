// Thin human-authenticated transport. Database RPC is the live authority boundary.
import { canonical, validWorkspace } from '../../../workspace/ir-workspace-contract.mjs';
import { bearerToken } from '../../../services/allocation-middleware/src/app/auth.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const reply = (status, data) => Response.json(data, { status, headers: {
  'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
} });
function validScaffold(value, client, operation) {
  if (!value || value.client_id !== client || value.tenant_id !== client
    || value.state !== 'scaffold_persisted' || value.runtime_ready !== false
    || !UUID.test(value.operation_id) || !UUID.test(value.idempotency_key)
    || (operation && value.operation_id !== operation)) return false;
  try {
    const policy = JSON.parse(value.policy_json);
    return policy.format === 'ir-policy-v1' && policy.policy.tenant_id === client
      && policy.policy.version === 'fi-empty-v1';
  } catch { return false; }
}
export async function handleIrProvisioning(request, env, { fetchImpl = fetch } = {}) {
  const url = new URL(request.url);
  const workspaceMode = url.pathname.startsWith('/api/ir/workspaces/');
  const match = url.pathname.match(/^\/api\/ir\/(?:provisioning|workspaces)\/(org_[a-z0-9_]+)$/);
  if (!match || match[1].length > 128 || url.search) return reply(400, { error: 'invalid_provisioning_identity' });
  if (!['GET', 'POST'].includes(request.method)) return reply(405, { error: 'method_not_allowed' });
  const token = bearerToken(request);
  if (!token) return reply(401, { error: 'authentication_required' });
  const base = env.PLATFORM_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.PLATFORM_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!base || !key) return reply(503, { error: 'provisioning_unavailable' });
  const client = match[1];
  let operation;
  if (request.method === 'POST') {
    // Read a bounded stream; a missing/forged Content-Length cannot bypass limit.
    try {
      const reader = request.body?.getReader();
      if (!reader) return reply(400, { error: 'invalid_request' });
      let size = 0; const chunks = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 1024) { await reader.cancel(); return reply(413, { error: 'payload_too_large' }); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!body || Object.keys(body).length !== 1 || !UUID.test(body.operation_id)) return reply(400, { error: 'invalid_request' });
      operation = body.operation_id;
    } catch { return reply(400, { error: 'invalid_request' }); }
  }
  const headers = { apikey: key, authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  try {
    // workerd supports manual, not error; reject redirects without forwarding credentials.
    const user = await fetchImpl(`${base}/auth/v1/user`, { headers, redirect: 'manual', signal: AbortSignal.timeout(10000) });
    if (!user.ok) return reply(user.status >= 500 || user.status < 400 ? 503 : 401, { error: 'authentication_failed' });
    if (!(await user.json())?.id) return reply(401, { error: 'authentication_failed' });
    const rpc = async (name, body) => {
      const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
        method: 'POST', headers, body: JSON.stringify(body), redirect: 'manual', signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        const error = new Error('provisioning_failed');
        error.status = [400, 401, 403, 409].includes(response.status) ? response.status : 503;
        throw error;
      }
      return response.json();
    };
    if (workspaceMode) {
      let written;
      if (operation) {
        written = await rpc('initialize_ir_workspace', { p_client_id: client, p_operation_id: operation });
        if (!await validWorkspace(written, client, operation)) throw new Error('invalid_workspace');
      }
      const workspace = await rpc('open_ir_workspace', { p_client_id: client });
      if (workspace === null && !operation) return reply(200, { workspace: null });
      if (!await validWorkspace(workspace, client, operation)
        || (written && canonical(written) !== canonical(workspace))) throw new Error('workspace_readback_mismatch');
      return reply(200, { workspace });
    }
    let written;
    if (operation) {
      written = await rpc('execute_ir_provisioning', { p_client_id: client, p_operation_id: operation });
      if (!validScaffold(written, client, operation)) throw new Error('invalid_scaffold');
    }
    const scaffold = await rpc('get_ir_workspace_scaffold', { p_client_id: client });
    if (scaffold === null && !operation) return reply(200, { scaffold: null });
    if (!validScaffold(scaffold, client, operation)
      || (written && Object.keys(written).some(key => written[key] !== scaffold[key]))) throw new Error('readback_mismatch');
    return reply(200, { scaffold });
  } catch (error) {
    return reply(error.status || 503, { error: 'provisioning_failed' });
  }
}
