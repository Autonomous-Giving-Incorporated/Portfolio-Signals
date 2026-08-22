import { createService } from '../../../services/allocation-middleware/src/app/service.mjs';
import { createSupabaseAllocationWriter } from '../../../services/allocation-middleware/src/app/supabase-writer.mjs';
import { verify_webhook } from '../../../services/allocation-middleware/src/connectors/adapter.mjs';
import {
  CONNECTOR_DONORBOX,
  CONNECTOR_EVERY_ORG,
  CONNECTOR_GIVEBUTTER,
} from '../../../services/allocation-middleware/src/connectors/sources.mjs';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  jsonHeaders,
  parseWebhookJson,
} from '../../../services/allocation-middleware/src/http/webhook-auth.mjs';

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders(),
  });
}

function logConnector(event, fields) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}

export function resolveWebhookBindings(env = {}) {
  return {
    webhookToken: env.WEBHOOK_TOKEN || '',
    givebutterSecret: env.GIVEBUTTER_WEBHOOK_SECRET || '',
    donorboxSecret: env.DONORBOX_WEBHOOK_SECRET || '',
    orgId: env.ORG_ID || 'org_hacker_dojo',
    supabaseUrl: env.PLATFORM_SUPABASE_URL || env.SUPABASE_URL || '',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '',
  };
}

export function createWebhookIngest(env, { fetchImpl = fetch, ingest, source } = {}) {
  if (typeof ingest === 'function') {
    return (payload) => ingest(payload, { source });
  }
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
  return (payload) => writer.ingestGift(payload, { source: source || CONNECTOR_EVERY_ORG });
}

/**
 * Memory ingest for deterministic tests only. Production Worker uses Supabase.
 */
export function createMemoryIngest(orgId = 'org_hacker_dojo') {
  const service = createService({ orgId });
  return (payload, options = {}) => service.ingestGift(payload, options);
}

export async function handleGiftWebhook(request, env, { source, ...options } = {}) {
  const url = new URL(request.url);
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const bindings = resolveWebhookBindings(env);
  const raw = await request.text();
  const declared = Number(request.headers.get('content-length') || 0);
  const maxBytes = options.maxJsonBodyBytes ?? DEFAULT_MAX_JSON_BODY_BYTES;
  if (Number.isFinite(declared) && declared > maxBytes) {
    return jsonResponse(413, { error: 'PAYLOAD_TOO_LARGE' });
  }

  const auth = await verify_webhook(new Request(request.url, { headers: request.headers }), {
    source,
    secrets: {
      webhookToken: bindings.webhookToken,
      givebutterSecret: bindings.givebutterSecret,
      donorboxSecret: bindings.donorboxSecret,
    },
    rawBody: raw,
    now: options.now,
  });
  if (!auth.ok) {
    logConnector('webhook_verify_failed', { source, path: url.pathname, status: auth.status });
    return jsonResponse(auth.status, { error: auth.error });
  }

  let payload;
  try {
    payload = parseWebhookJson(raw, maxBytes, { allowArray: source === CONNECTOR_DONORBOX });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'malformed_payload';
    const status = message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return jsonResponse(status, { error: message });
  }

  try {
    const ingest = createWebhookIngest(env, { ...options, source });
    const result = await ingest(payload, { source });
    logConnector('webhook_ingested', {
      source,
      path: url.pathname,
      created: Boolean(result?.created),
      held: Boolean(result?.held),
    });
    return jsonResponse(200, { created: Boolean(result?.created) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error';
    if (message === 'allocation_store_unavailable') {
      return jsonResponse(503, { error: 'allocation_store_unavailable' });
    }
    logConnector('webhook_ingest_failed', { source, path: url.pathname, error: message });
    return jsonResponse(400, { error: message });
  }
}

export async function handleEveryOrgWebhook(request, env, options = {}) {
  return handleGiftWebhook(request, env, { ...options, source: CONNECTOR_EVERY_ORG });
}

export async function handleGivebutterWebhook(request, env, options = {}) {
  return handleGiftWebhook(request, env, { ...options, source: CONNECTOR_GIVEBUTTER });
}

export async function handleDonorboxWebhook(request, env, options = {}) {
  return handleGiftWebhook(request, env, { ...options, source: CONNECTOR_DONORBOX });
}
