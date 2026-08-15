import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEveryOrgWebhookUrl } from '../app/config.mjs';
import { createAuthVerifier, bearerToken } from '../app/auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startedAt = Date.now();

const DEFAULT_JSON_BODY_BYTES = 256 * 1024;
const DEFAULT_CSV_BODY_BYTES = 5 * 1024 * 1024;

class PayloadTooLargeError extends Error {
  constructor() {
    super('PAYLOAD_TOO_LARGE');
  }
}

async function readBody(req, maxBytes) {
  const declared = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLargeError();
  const chunks = [];
  let bytes = 0;
  for await (const c of req) {
    bytes += c.length;
    if (bytes > maxBytes) throw new PayloadTooLargeError();
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req, maxBytes) {
  const raw = (await readBody(req, maxBytes)) || '{}';
  return JSON.parse(raw);
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  });
  res.end(body);
}

function unauthorized(res, code = 'UNAUTHORIZED') {
  send(res, 401, { error: code });
}

function forbidden(res, code = 'FORBIDDEN') {
  send(res, 403, { error: code });
}

/**
 * @param {object} opts
 * @param {object} opts.service
 * @param {string} [opts.operatorToken] legacy shared secret
 * @param {string} [opts.webhookToken]
 * @param {string} [opts.publicBaseUrl]
 * @param {object|null} [opts.authVerifier] from createAuthVerifier
 * @param {boolean} [opts.allowOperatorFallback] default true when no authVerifier
 * @param {object} [opts.authPublic] { supabaseUrl, supabaseAnonKey, orgId } for login UI
 */
export function createAllocationServer({
  service,
  operatorToken = '',
  webhookToken = '',
  publicBaseUrl = '',
  authVerifier = null,
  allowOperatorFallback = true,
  authPublic = null,
  maxJsonBodyBytes = DEFAULT_JSON_BODY_BYTES,
  maxCsvBodyBytes = DEFAULT_CSV_BODY_BYTES,
}) {
  function operatorTokenOk(req) {
    if (!operatorToken || !allowOperatorFallback) return false;
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const header = req.headers['x-operator-token'] || '';
    // Do not treat JWT-looking long bearers as operator token unless exact match
    return bearer === operatorToken || header === operatorToken;
  }

  /**
   * Authorize write: director/campaign_lead JWT membership, or legacy operator token.
   * @returns {Promise<{ ok: boolean, actor?: object, mode?: string }>}
   */
  async function authorizeWrite(req, res) {
    if (authVerifier) {
      try {
        const actor = await authVerifier.resolve(req);
        if (actor?.canWrite) {
          return { ok: true, actor, mode: 'supabase_director' };
        }
        if (actor && !actor.canWrite) {
          const code = actor.aal !== 'aal2'
            ? 'aal2_session_required'
            : !actor.mfaEnforced
              ? 'mfa_enrollment_required'
              : 'director_or_campaign_lead_required';
          forbidden(res, code);
          return { ok: false };
        }
      } catch {
        send(res, 503, { error: 'authentication_unavailable' });
        return { ok: false };
      }
    }

    if (operatorTokenOk(req)) {
      return {
        ok: true,
        actor: { email: 'operator-token', role: 'operator', canWrite: true },
        mode: 'operator_token',
      };
    }

    // No auth configured at all (local open demo)
    if (!authVerifier && !operatorToken) {
      return { ok: true, actor: { email: 'anonymous', role: 'open_dev', canWrite: true }, mode: 'open_dev' };
    }

    unauthorized(res, authVerifier ? 'valid_bearer_session_required' : 'UNAUTHORIZED');
    return { ok: false };
  }

  async function authorizeRead(req, res) {
    if (authVerifier) {
      try {
        const actor = await authVerifier.resolve(req);
        if (actor?.canRead) return { ok: true, actor, mode: 'supabase_member' };
      } catch {
        send(res, 503, { error: 'authentication_unavailable' });
        return { ok: false };
      }
    }
    if (operatorTokenOk(req)) {
      return { ok: true, actor: { role: 'operator', canRead: true }, mode: 'operator_token' };
    }
    if (!authVerifier && !operatorToken) {
      return { ok: true, actor: { role: 'open_dev', canRead: true }, mode: 'open_dev' };
    }
    unauthorized(res, 'valid_bearer_session_required');
    return { ok: false };
  }

  function requireWebhook(req, res, url) {
    if (!webhookToken) return true;
    const header = req.headers['x-webhook-token'] || '';
    const query = url.searchParams.get('token') || '';
    if (header === webhookToken || query === webhookToken) return true;
    unauthorized(res);
    return false;
  }

  const publicRoot = path.join(__dirname, '../../public');

  function contentTypeFor(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.css') return 'text/css; charset=utf-8';
    if (ext === '.js') return 'text/javascript; charset=utf-8';
    if (ext === '.png') return 'image/png';
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.ico') return 'image/x-icon';
    if (ext === '.woff2') return 'font/woff2';
    return 'application/octet-stream';
  }

  function isStaticPath(pathname) {
    return pathname.startsWith('/css/') || pathname.startsWith('/assets/');
  }

  async function serveStatic(res, pathname) {
    const rel = pathname.replace(/^\/+/, '');
    if (rel.includes('..') || path.isAbsolute(rel)) {
      return send(res, 400, { error: 'bad_path' });
    }
    const filePath = path.join(publicRoot, rel);
    if (!filePath.startsWith(publicRoot)) {
      return send(res, 400, { error: 'bad_path' });
    }
    try {
      const st = await stat(filePath);
      if (!st.isFile()) {
        return send(res, 404, { error: 'not_found' });
      }
      const body = await readFile(filePath);
      res.writeHead(200, {
        'content-type': contentTypeFor(filePath),
        'x-content-type-options': 'nosniff',
        'cache-control': 'public, max-age=3600',
      });
      return res.end(body);
    } catch {
      return send(res, 404, { error: 'not_found' });
    }
  }

  async function serveHtml(res, name) {
    const htmlPath = path.join(publicRoot, name);
    try {
      const html = await readFile(htmlPath, 'utf8');
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      });
      return res.end(html);
    } catch {
      return send(res, 404, { error: 'ui_missing' });
    }
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/healthz') {
        return send(res, 200, {
          status: 'ok',
          uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
        });
      }
      if (req.method === 'GET' && url.pathname === '/readyz') {
        const h = await service.health();
        return send(res, 200, {
          status: 'ready',
          auth: authVerifier ? 'supabase' : operatorToken ? 'operator_token' : 'open_dev',
          ...h,
        });
      }

      // Public config for browser login (anon key is designed for client use)
      if (req.method === 'GET' && url.pathname === '/auth/config') {
        return send(res, 200, {
          orgId: authPublic?.orgId || null,
          supabaseUrl: authPublic?.supabaseUrl || null,
          supabaseAnonKey: authPublic?.supabaseAnonKey || null,
          directorLoginEnabled: Boolean(authVerifier && authPublic?.supabaseAnonKey),
          operatorTokenFallback: Boolean(allowOperatorFallback && operatorToken),
          writeRoles: ['director', 'campaign_lead'],
        });
      }

      if (req.method === 'GET' && url.pathname === '/auth/me') {
        if (!authVerifier) {
          if (operatorTokenOk(req)) {
            return send(res, 200, {
              mode: 'operator_token',
              role: 'operator',
              canWrite: true,
              email: 'operator-token',
            });
          }
          if (!operatorToken) {
            return send(res, 200, { mode: 'open_dev', canWrite: true });
          }
          return unauthorized(res, 'valid_bearer_session_required');
        }
        try {
          const actor = await authVerifier.resolve(req);
          if (!actor) return unauthorized(res, 'valid_bearer_session_required');
          return send(res, 200, {
            mode: 'supabase_director',
            role: actor.role,
            canWrite: actor.canWrite,
            email: actor.email,
            displayName: actor.displayName,
            clientId: actor.clientId,
            source: actor.source,
          });
        } catch {
          return send(res, 503, { error: 'authentication_unavailable' });
        }
      }

      if (req.method === 'GET' && url.pathname === '/setup') {
        const authz = await authorizeWrite(req, res);
        if (!authz.ok) return;
        const webhookUrl = buildEveryOrgWebhookUrl(publicBaseUrl, webhookToken);
        const status = await service.getSetupStatus({
          webhookUrl,
          hasWebhookToken: Boolean(webhookToken),
          hasOperatorToken: Boolean(operatorToken),
        });
        return send(res, 200, {
          ...status,
          directorLoginEnabled: Boolean(authVerifier),
        });
      }
      if (req.method === 'GET' && (url.pathname === '/setup.html' || url.pathname === '/connect')) {
        return serveHtml(res, 'setup.html');
      }
      if (req.method === 'GET' && url.pathname === '/login.html') {
        return serveHtml(res, 'login.html');
      }

      if (req.method === 'POST' && url.pathname === '/webhooks/every-org') {
        if (!requireWebhook(req, res, url)) return;
        const payload = await readJson(req, maxJsonBodyBytes);
        const result = await service.ingestEveryOrg(payload);
        return send(res, 200, { created: result.created });
      }
      if (req.method === 'POST' && url.pathname === '/import/csv') {
        const authz = await authorizeWrite(req, res);
        if (!authz.ok) return;
        const ct = req.headers['content-type'] || '';
        let csvText = '';
        if (ct.includes('application/json')) {
          const body = await readJson(req, maxCsvBodyBytes);
          csvText = body.csv || '';
        } else {
          csvText = await readBody(req, maxCsvBodyBytes);
        }
        const result = await service.importCsv(csvText);
        return send(res, 200, result);
      }
      if (req.method === 'GET' && url.pathname === '/available') {
        const authz = await authorizeRead(req, res);
        if (!authz.ok) return;
        return send(res, 200, await service.listAvailable());
      }
      if (req.method === 'POST' && url.pathname === '/allocations') {
        const authz = await authorizeWrite(req, res);
        if (!authz.ok) return;
        const body = await readJson(req, maxJsonBodyBytes);
        if (!body.approvedBy && authz.actor?.email) {
          body.approvedBy = authz.actor.email;
        }
        const alloc = await service.allocate(body);
        return send(res, 201, {
          id: alloc.id,
          status: alloc.status,
          amountCents: alloc.amountCents.toString(),
          approvedBy: alloc.approvedBy,
        });
      }
      if (req.method === 'POST' && url.pathname === '/proofs') {
        const authz = await authorizeWrite(req, res);
        if (!authz.ok) return;
        const body = await readJson(req, maxJsonBodyBytes);
        if (!body.attachedBy && authz.actor?.email) {
          body.attachedBy = authz.actor.email;
        }
        const result = await service.attachProof(body);
        return send(res, 201, result);
      }
      if (req.method === 'GET' && url.pathname === '/labels') {
        const authz = await authorizeRead(req, res);
        if (!authz.ok) return;
        return send(res, 200, await service.listLabels());
      }
      if (req.method === 'POST' && url.pathname === '/labels') {
        const authz = await authorizeWrite(req, res);
        if (!authz.ok) return;
        const body = await readJson(req, maxJsonBodyBytes);
        await service.setLabel(body);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/pots/merge') {
        const authz = await authorizeWrite(req, res);
        if (!authz.ok) return;
        const body = await readJson(req, maxJsonBodyBytes);
        await service.mergePots(body);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/exceptions') {
        const authz = await authorizeRead(req, res);
        if (!authz.ok) return;
        return send(res, 200, await service.listExceptions());
      }
      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/exceptions/') &&
        url.pathname.endsWith('/resolve')
      ) {
        const authz = await authorizeWrite(req, res);
        if (!authz.ok) return;
        const id = url.pathname.split('/')[2];
        await service.resolveException(id);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/trail') {
        const authz = await authorizeRead(req, res);
        if (!authz.ok) return;
        const t = await service.getTrail();
        return send(res, 200, {
          gifts: t.gifts.map((g) => ({
            ...g,
            netCents: g.netCents.toString(),
            grossCents: g.grossCents.toString(),
          })),
          allocations: t.allocations.map((a) => ({
            ...a,
            amountCents: a.amountCents.toString(),
          })),
          proofs: t.proofs,
        });
      }
      if (req.method === 'GET' && url.pathname === '/packet') {
        const authz = await authorizeRead(req, res);
        if (!authz.ok) return;
        return send(res, 200, await service.getPacket());
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        return serveHtml(res, 'index.html');
      }
      if (req.method === 'GET' && isStaticPath(url.pathname)) {
        return serveStatic(res, url.pathname);
      }
      send(res, 404, { error: 'not_found' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error';
      const status = message === 'PAYLOAD_TOO_LARGE' ? 413 : message === 'OVER_ALLOCATION' ? 409 : 400;
      send(res, status, { error: message });
    }
  });
}

const isMain =
  process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  const { loadConfig } = await import('../app/config.mjs');
  const { createService } = await import('../app/service.mjs');
  const { createFileStore, createMemoryStore } = await import('../app/store.mjs');
  const cfg = loadConfig(process.env);
  if (!cfg.ok) {
    console.error('Production configuration invalid:');
    for (const e of cfg.errors) console.error(' -', e);
    process.exit(1);
  }
  const store = cfg.dataFile ? createFileStore(cfg.dataFile) : createMemoryStore();
  const service = createService({
    orgId: cfg.orgId,
    store,
    proofSlaHours: cfg.proofSlaHours,
  });
  const { maybeSeedOnBoot } = await import('../app/boot.mjs');
  await maybeSeedOnBoot(service, process.env);
  const authVerifier = cfg.hasSupabaseAuth
    ? createAuthVerifier({
        supabaseUrl: cfg.supabaseUrl,
        serviceRoleKey: cfg.supabaseServiceRoleKey,
        clientId: cfg.orgId,
      })
    : null;
  const server = createAllocationServer({
    service,
    operatorToken: cfg.operatorToken,
    webhookToken: cfg.webhookToken,
    publicBaseUrl: cfg.publicBaseUrl || `http://127.0.0.1:${cfg.port}`,
    authVerifier,
    allowOperatorFallback: cfg.allowOperatorFallback,
    authPublic: {
      orgId: cfg.orgId,
      supabaseUrl: cfg.supabaseUrl || null,
      supabaseAnonKey: cfg.supabaseAnonKey || null,
    },
  });
  server.listen(cfg.port, '0.0.0.0', () => {
    console.log(
      JSON.stringify({
        msg: 'allocation-middleware listening',
        port: cfg.port,
        orgId: cfg.orgId,
        store: cfg.dataFile || 'memory',
        production: cfg.production,
        auth: authVerifier ? 'supabase_director' : cfg.operatorToken ? 'operator_token' : 'open_dev',
      }),
    );
  });
}
