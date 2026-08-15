import { createService } from '../../../services/allocation-middleware/src/app/service.mjs';
import { createAuthVerifier } from '../../../services/allocation-middleware/src/app/auth.mjs';
import { createSupabaseStore } from '../../../services/allocation-middleware/src/app/supabase-store.mjs';
import { seedFromObject } from '../../../services/allocation-middleware/src/app/seed.mjs';
import { buildEveryOrgWebhookUrl } from '../../../services/allocation-middleware/src/app/config.mjs';
import { createResendNotifier } from '../../../services/allocation-middleware/src/app/impact-notice.mjs';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  jsonHeaders,
  parseWebhookJson,
} from '../../../services/allocation-middleware/src/http/webhook-auth.mjs';
import fixture from '../../../services/allocation-middleware/fixtures/hacker-dojo-pilot.json' with { type: 'json' };

export const DEFAULT_MAX_CSV_BODY_BYTES = 5 * 1024 * 1024;

export const ALLOCATION_API_PATHS = new Set([
  '/healthz',
  '/readyz',
  '/auth/config',
  '/auth/me',
  '/available',
  '/allocations',
  '/proofs',
  '/packet',
  '/exceptions',
  '/labels',
  '/pots/merge',
  '/setup',
  '/seed',
  '/trail',
  '/waivers',
  '/import/csv',
]);

export function isAllocationApiPath(pathname) {
  return ALLOCATION_API_PATHS.has(pathname);
}

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders() });
}

export function resolveAllocationBindings(env = {}) {
  return {
    orgId: env.ORG_ID || 'org_hacker_dojo',
    supabaseUrl: env.PLATFORM_SUPABASE_URL || env.SUPABASE_URL || '',
    anonKey: env.PLATFORM_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '',
    webhookToken: env.WEBHOOK_TOKEN || '',
    publicBaseUrl: (env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
  };
}

export function createAllocationRuntime(env = {}, options = {}) {
  if (options.service && options.authVerifier !== undefined) {
    return {
      service: options.service,
      authVerifier: options.authVerifier,
      bindings: resolveAllocationBindings(env),
    };
  }
  const bindings = resolveAllocationBindings(env);
  if (!bindings.supabaseUrl || !bindings.serviceRoleKey) {
    return { service: null, authVerifier: null, bindings };
  }
  const store = options.store || createSupabaseStore({
    supabaseUrl: bindings.supabaseUrl,
    serviceRoleKey: bindings.serviceRoleKey,
    orgId: bindings.orgId,
    fetchImpl: options.fetchImpl || fetch,
  });
  return {
    service: createService({
      orgId: bindings.orgId,
      store,
      notifier: options.notifier || createResendNotifier(env, options),
    }),
    authVerifier: createAuthVerifier({
      supabaseUrl: bindings.supabaseUrl,
      serviceRoleKey: bindings.serviceRoleKey,
      clientId: bindings.orgId,
      fetchImpl: options.fetchImpl || fetch,
    }),
    bindings,
  };
}

async function authorize(req, resKind, runtime) {
  if (!runtime.authVerifier) {
    return { ok: false, response: jsonResponse(503, { error: 'authentication_unavailable' }) };
  }
  try {
    const actor = await runtime.authVerifier.resolve(req);
    if (resKind === 'write') {
      if (actor?.canWrite) return { ok: true, actor };
      if (actor && !actor.canWrite) {
        const code = actor.aal !== 'aal2'
          ? 'aal2_session_required'
          : !actor.mfaEnforced
            ? 'mfa_enrollment_required'
            : 'director_or_campaign_lead_required';
        return { ok: false, response: jsonResponse(403, { error: code }) };
      }
      return { ok: false, response: jsonResponse(401, { error: 'valid_bearer_session_required' }) };
    }
    if (actor?.canRead) return { ok: true, actor };
    return { ok: false, response: jsonResponse(401, { error: 'valid_bearer_session_required' }) };
  } catch {
    return { ok: false, response: jsonResponse(503, { error: 'authentication_unavailable' }) };
  }
}

async function readJson(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }
  return parseWebhookJson(await request.text(), maxBytes);
}

async function readCsvBody(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }
  const raw = await request.text();
  const bytes = new TextEncoder().encode(raw).byteLength;
  if (bytes > maxBytes) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = parseWebhookJson(raw, maxBytes);
    return String(body.csv || '');
  }
  return raw;
}

export async function handleAllocationApi(request, env, options = {}) {
  const url = new URL(request.url);
  const runtime = createAllocationRuntime(env, options);
  const maxBytes = options.maxJsonBodyBytes ?? DEFAULT_MAX_JSON_BODY_BYTES;

  if (request.method === 'GET' && url.pathname === '/healthz') {
    return jsonResponse(200, { status: 'ok', host: 'cloudflare-workers' });
  }
  if (request.method === 'GET' && url.pathname === '/auth/config') {
    return jsonResponse(200, {
      orgId: runtime.bindings.orgId,
      supabaseUrl: runtime.bindings.supabaseUrl || null,
      supabaseAnonKey: runtime.bindings.anonKey || null,
      directorLoginEnabled: Boolean(runtime.authVerifier && runtime.bindings.anonKey),
      operatorTokenFallback: false,
      writeRoles: ['director', 'campaign_lead'],
      host: 'cloudflare-workers',
    });
  }

  if (!runtime.service) {
    return jsonResponse(503, { error: 'allocation_store_unavailable' });
  }

  try {
    if (request.method === 'GET' && url.pathname === '/readyz') {
      const health = await runtime.service.health();
      return jsonResponse(200, { status: 'ready', auth: 'supabase', operatorTokenFallback: false, ...health });
    }
    if (request.method === 'GET' && url.pathname === '/auth/me') {
      const authz = await authorize(request, 'read', runtime);
      if (!authz.ok) return authz.response;
      return jsonResponse(200, {
        mode: 'supabase_director',
        role: authz.actor.role,
        canWrite: authz.actor.canWrite,
        email: authz.actor.email,
        displayName: authz.actor.displayName,
        clientId: authz.actor.clientId,
        source: authz.actor.source,
      });
    }
    if (request.method === 'GET' && url.pathname === '/available') {
      const authz = await authorize(request, 'read', runtime);
      if (!authz.ok) return authz.response;
      return jsonResponse(200, await runtime.service.listAvailable());
    }
    if (request.method === 'POST' && url.pathname === '/allocations') {
      const authz = await authorize(request, 'write', runtime);
      if (!authz.ok) return authz.response;
      const body = await readJson(request, maxBytes);
      if (!body.approvedBy && authz.actor?.email) body.approvedBy = authz.actor.email;
      const alloc = await runtime.service.allocate(body);
      return jsonResponse(201, {
        id: alloc.id,
        status: alloc.status,
        amountCents: alloc.amountCents.toString(),
        approvedBy: alloc.approvedBy,
      });
    }
    if (request.method === 'POST' && url.pathname === '/proofs') {
      const authz = await authorize(request, 'write', runtime);
      if (!authz.ok) return authz.response;
      const body = await readJson(request, maxBytes);
      if (body.waive === true || body.proofWaived === true) {
        if (!body.waivedBy && authz.actor?.email) body.waivedBy = authz.actor.email;
        const result = await runtime.service.waiveProof(body);
        return jsonResponse(201, result);
      }
      if (!body.attachedBy && authz.actor?.email) body.attachedBy = authz.actor.email;
      const result = await runtime.service.attachProof(body);
      return jsonResponse(201, result);
    }
    if (request.method === 'POST' && url.pathname === '/waivers') {
      const authz = await authorize(request, 'write', runtime);
      if (!authz.ok) return authz.response;
      const body = await readJson(request, maxBytes);
      if (!body.waivedBy && authz.actor?.email) body.waivedBy = authz.actor.email;
      const result = await runtime.service.waiveProof(body);
      return jsonResponse(201, result);
    }
    if (request.method === 'GET' && url.pathname === '/packet') {
      const authz = await authorize(request, 'read', runtime);
      if (!authz.ok) return authz.response;
      return jsonResponse(200, await runtime.service.getPacket());
    }
    if (request.method === 'GET' && url.pathname === '/exceptions') {
      const authz = await authorize(request, 'read', runtime);
      if (!authz.ok) return authz.response;
      return jsonResponse(200, await runtime.service.listExceptions());
    }
    if (request.method === 'GET' && url.pathname === '/labels') {
      const authz = await authorize(request, 'read', runtime);
      if (!authz.ok) return authz.response;
      return jsonResponse(200, await runtime.service.listLabels());
    }
    if (request.method === 'POST' && url.pathname === '/labels') {
      const authz = await authorize(request, 'write', runtime);
      if (!authz.ok) return authz.response;
      await runtime.service.setLabel(await readJson(request, maxBytes));
      return jsonResponse(200, { ok: true });
    }
    if (request.method === 'POST' && url.pathname === '/pots/merge') {
      const authz = await authorize(request, 'write', runtime);
      if (!authz.ok) return authz.response;
      await runtime.service.mergePots(await readJson(request, maxBytes));
      return jsonResponse(200, { ok: true });
    }
    if (request.method === 'GET' && url.pathname === '/trail') {
      const authz = await authorize(request, 'read', runtime);
      if (!authz.ok) return authz.response;
      const trail = await runtime.service.getTrail();
      return jsonResponse(200, {
        gifts: trail.gifts.map((gift) => ({
          ...gift,
          netCents: gift.netCents.toString(),
          grossCents: gift.grossCents.toString(),
        })),
        allocations: trail.allocations.map((allocation) => ({
          ...allocation,
          amountCents: allocation.amountCents.toString(),
        })),
        proofs: trail.proofs,
      });
    }
    if (request.method === 'GET' && url.pathname === '/setup') {
      const authz = await authorize(request, 'write', runtime);
      if (!authz.ok) return authz.response;
      const origin = runtime.bindings.publicBaseUrl || url.origin;
      const webhookUrl = buildEveryOrgWebhookUrl(origin, runtime.bindings.webhookToken);
      const status = await runtime.service.getSetupStatus({
        webhookUrl,
        hasWebhookToken: Boolean(runtime.bindings.webhookToken),
        hasOperatorToken: false,
      });
      return jsonResponse(200, { ...status, directorLoginEnabled: true, operatorTokenFallback: false });
    }
    if (request.method === 'POST' && url.pathname === '/setup') {
      const authz = await authorize(request, 'write', runtime);
      if (!authz.ok) return authz.response;
      const body = await readJson(request, maxBytes);
      const result = await runtime.service.setDonationLink(body.donationLink);
      return jsonResponse(200, result);
    }
    if (request.method === 'POST' && url.pathname === '/seed') {
      const authz = await authorize(request, 'write', runtime);
      if (!authz.ok) return authz.response;
      if (fixture.orgId !== runtime.bindings.orgId) {
        return jsonResponse(409, { error: 'seed_org_mismatch' });
      }
      const result = await seedFromObject(runtime.service, fixture, { applySuggestedAllocation: false });
      return jsonResponse(200, {
        seeded: true,
        orgId: result.orgId,
        giftsCreated: result.giftsCreated,
        liveGift: false,
      });
    }
    if (request.method === 'POST' && url.pathname === '/import/csv') {
      const authz = await authorize(request, 'write', runtime);
      if (!authz.ok) return authz.response;
      const maxCsvBytes = options.maxCsvBodyBytes ?? DEFAULT_MAX_CSV_BODY_BYTES;
      const csvText = await readCsvBody(request, maxCsvBytes);
      if (!String(csvText).trim()) {
        return jsonResponse(400, { error: 'csv_required' });
      }
      const result = await runtime.service.importCsv(csvText);
      return jsonResponse(200, result);
    }
    return jsonResponse(405, { error: 'method_not_allowed' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error';
    const status = message === 'PAYLOAD_TOO_LARGE' ? 413 : message === 'OVER_ALLOCATION' ? 409 : 400;
    return jsonResponse(status, { error: message });
  }
}
