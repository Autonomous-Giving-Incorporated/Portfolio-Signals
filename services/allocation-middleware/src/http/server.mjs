import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEveryOrgWebhookUrl } from '../app/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startedAt = Date.now();

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  const raw = (await readBody(req)) || '{}';
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

function unauthorized(res) {
  send(res, 401, { error: 'UNAUTHORIZED' });
}

export function createAllocationServer({ service, operatorToken, webhookToken, publicBaseUrl = '' }) {
    function requireOperator(req, res) {
    if (!operatorToken) return true;
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const header = req.headers['x-operator-token'] || '';
    if (bearer === operatorToken || header === operatorToken) return true;
    unauthorized(res);
    return false;
  }

  function requireWebhook(req, res, url) {
    if (!webhookToken) return true;
    const header = req.headers['x-webhook-token'] || '';
    // Query token supports providers (e.g. every.org) that cannot set custom headers.
    // Prefer header in production; query is for pilot webhooks only.
    const query = url.searchParams.get('token') || '';
    if (header === webhookToken || query === webhookToken) return true;
    unauthorized(res);
    return false;
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/healthz') {
        return send(res, 200, { status: 'ok', uptimeSec: Math.floor((Date.now() - startedAt) / 1000) });
      }
      if (req.method === 'GET' && url.pathname === '/readyz') {
        const h = await service.health();
        return send(res, 200, { status: 'ready', ...h });
      }
      if (req.method === 'GET' && url.pathname === '/setup') {
        const webhookUrl = buildEveryOrgWebhookUrl(publicBaseUrl, webhookToken);
        const status = await service.getSetupStatus({
          webhookUrl,
          hasWebhookToken: Boolean(webhookToken),
          hasOperatorToken: Boolean(operatorToken),
        });
        return send(res, 200, status);
      }
      if (req.method === 'GET' && (url.pathname === '/setup.html' || url.pathname === '/connect')) {
        const htmlPath = path.join(__dirname, '../../public/setup.html');
        try {
          const html = await readFile(htmlPath, 'utf8');
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'x-content-type-options': 'nosniff',
            'cache-control': 'no-store',
          });
          return res.end(html);
        } catch {
          return send(res, 404, { error: 'setup_ui_missing' });
        }
      }


      if (req.method === 'POST' && url.pathname === '/webhooks/every-org') {
        if (!requireWebhook(req, res, url)) return;
        const payload = await readJson(req);
        const result = await service.ingestEveryOrg(payload);
        return send(res, 200, { created: result.created });
      }
      if (req.method === 'POST' && url.pathname === '/import/csv') {
        if (!requireOperator(req, res)) return;
        const ct = req.headers['content-type'] || '';
        let csvText = '';
        if (ct.includes('application/json')) {
          const body = await readJson(req);
          csvText = body.csv || '';
        } else {
          csvText = await readBody(req);
        }
        const result = await service.importCsv(csvText);
        return send(res, 200, result);
      }
      if (req.method === 'GET' && url.pathname === '/available') {
        return send(res, 200, await service.listAvailable());
      }
      if (req.method === 'POST' && url.pathname === '/allocations') {
        if (!requireOperator(req, res)) return;
        const body = await readJson(req);
        const alloc = await service.allocate(body);
        return send(res, 201, {
          id: alloc.id,
          status: alloc.status,
          amountCents: alloc.amountCents.toString(),
        });
      }
      if (req.method === 'POST' && url.pathname === '/proofs') {
        if (!requireOperator(req, res)) return;
        const body = await readJson(req);
        const result = await service.attachProof(body);
        return send(res, 201, result);
      }
      if (req.method === 'GET' && url.pathname === '/labels') {
        return send(res, 200, await service.listLabels());
      }
      if (req.method === 'POST' && url.pathname === '/labels') {
        if (!requireOperator(req, res)) return;
        const body = await readJson(req);
        await service.setLabel(body);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/pots/merge') {
        if (!requireOperator(req, res)) return;
        const body = await readJson(req);
        await service.mergePots(body);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/exceptions') {
        return send(res, 200, await service.listExceptions());
      }
      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/exceptions/') &&
        url.pathname.endsWith('/resolve')
      ) {
        if (!requireOperator(req, res)) return;
        const id = url.pathname.split('/')[2];
        await service.resolveException(id);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/trail') {
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
        return send(res, 200, await service.getPacket());
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const htmlPath = path.join(__dirname, '../../public/index.html');
        try {
          const html = await readFile(htmlPath, 'utf8');
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'x-content-type-options': 'nosniff',
            'cache-control': 'no-store',
          });
          return res.end(html);
        } catch {
          return send(res, 200, { service: 'allocation-middleware', ok: true });
        }
      }
      send(res, 404, { error: 'not_found' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error';
      const status = message === 'OVER_ALLOCATION' ? 409 : 400;
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
  const server = createAllocationServer({
    service,
    operatorToken: cfg.operatorToken,
    webhookToken: cfg.webhookToken,
    publicBaseUrl: cfg.publicBaseUrl || `http://127.0.0.1:${cfg.port}`,
  });
  server.listen(cfg.port, '0.0.0.0', () => {
    console.log(
      JSON.stringify({
        msg: 'allocation-middleware listening',
        port: cfg.port,
        orgId: cfg.orgId,
        store: cfg.dataFile || 'memory',
        production: cfg.production,
      }),
    );
  });
}
