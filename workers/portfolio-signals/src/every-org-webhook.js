import { createService } from '../../../services/allocation-middleware/src/app/service.mjs';
import { createSupabaseAllocationWriter } from '../../../services/allocation-middleware/src/app/supabase-writer.mjs';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  authorizeWebhookToken,
  jsonHeaders,
  parseWebhookJson,
} from '../../../services/allocation-middleware/src/http/webhook-auth.mjs';

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders(),
  });
}

export function resolveWebhookBindings(env = {}) {
  return {
    webhookToken: env.WEBHOOK_TOKEN || '',
    orgId: env.ORG_ID || 'org_hacker_dojo',
    supabaseUrl: env.PLATFORM_SUPABASE_URL || env.SUPABASE_URL || '',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '',
  };
}

export function createWebhookIngest(env, { fetchImpl = fetch, ingest } = {}) {
  if (typeof ingest === 'function') return ingest;
  const bindings = resolveWebhookBindings(env);
  if (!bindings.supabaseUrl || !bindings.serviceRoleKey) {
    return async () => {
      const err = new Error('allocation_store_unavailable');
      err.code = 'allocation_store_unavailable';
      throw err;
    };
  }
  const writer = createSupabaseAllocationWriter({
    supabaseUrl: bindings.supabaseUrl,
    serviceRoleKey: bindings.serviceRoleKey,
    orgId: bindings.orgId,
    fetchImpl,
  });
  return (payload) => writer.ingestEveryOrg(payload);
}

/**
 * Memory ingest for deterministic tests only. Production Worker uses Supabase.
 */
export function createMemoryIngest(orgId = 'org_hacker_dojo') {
  const service = createService({ orgId });
  return (payload) => service.ingestEveryOrg(payload);
}

export async function handleEveryOrgWebhook(request, env, options = {}) {
  const url = new URL(request.url);
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const bindings = resolveWebhookBindings(env);
  const headerToken = request.headers.get('x-webhook-token') || '';
  const queryToken = url.searchParams.get('token') || '';
  const auth = authorizeWebhookToken(headerToken, queryToken, bindings.webhookToken);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.error });
  }

  const maxBytes = options.maxJsonBodyBytes ?? DEFAULT_MAX_JSON_BODY_BYTES;
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return jsonResponse(413, { error: 'PAYLOAD_TOO_LARGE' });
  }

  let payload;
  try {
    const raw = await request.text();
    payload = parseWebhookJson(raw, maxBytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'malformed_payload';
    const status = message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return jsonResponse(status, { error: message });
  }

  try {
    const ingest = createWebhookIngest(env, options);
    const result = await ingest(payload);
    return jsonResponse(200, { created: Boolean(result?.created) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error';
    if (message === 'allocation_store_unavailable') {
      return jsonResponse(503, { error: 'allocation_store_unavailable' });
    }
    return jsonResponse(400, { error: message });
  }
}
