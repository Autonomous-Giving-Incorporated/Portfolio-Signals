import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  });
  res.end(body);
}

function unauthorized(res) {
  send(res, 401, { error: 'UNAUTHORIZED' });
}

/**
 * @param {{ service: any, operatorToken?: string, webhookToken?: string }} opts
 * operatorToken protects mutating operator routes when set.
 * webhookToken protects every.org webhook when set (header x-webhook-token).
 */
export function createAllocationServer({ service, operatorToken, webhookToken }) {
  function requireOperator(req, res) {
    if (!operatorToken) return true;
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const header = req.headers['x-operator-token'] || '';
    if (bearer === operatorToken || header === operatorToken) return true;
    unauthorized(res);
    return false;
  }

  function requireWebhook(req, res) {
    if (!webhookToken) return true;
    const header = req.headers['x-webhook-token'] || '';
    if (header === webhookToken) return true;
    unauthorized(res);
    return false;
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (req.method === 'POST' && url.pathname === '/webhooks/every-org') {
        if (!requireWebhook(req, res)) return;
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
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
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
  const { createService } = await import('../app/service.mjs');
  const { createFileStore, createMemoryStore } = await import('../app/store.mjs');
  const orgId = process.env.ORG_ID || 'org_demo';
  const dataFile = process.env.DATA_FILE || '';
  const store = dataFile ? createFileStore(dataFile) : createMemoryStore();
  const service = createService({
    orgId,
    store,
    proofSlaHours: Number(process.env.PROOF_SLA_HOURS || 72),
  });
  const server = createAllocationServer({
    service,
    operatorToken: process.env.OPERATOR_TOKEN || '',
    webhookToken: process.env.WEBHOOK_TOKEN || '',
  });
  const port = Number(process.env.PORT || 8787);
  server.listen(port, () => {
    console.log(
      `allocation-middleware on http://127.0.0.1:${port} org=${orgId} store=${dataFile || 'memory'}`,
    );
  });
}
