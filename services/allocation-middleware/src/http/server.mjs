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

export function createAllocationServer({ service }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (req.method === 'POST' && url.pathname === '/webhooks/every-org') {
        const payload = await readJson(req);
        const result = service.ingestEveryOrg(payload);
        return send(res, 200, { created: result.created });
      }
      if (req.method === 'POST' && url.pathname === '/import/csv') {
        const ct = req.headers['content-type'] || '';
        let csvText = '';
        if (ct.includes('application/json')) {
          const body = await readJson(req);
          csvText = body.csv || '';
        } else {
          csvText = await readBody(req);
        }
        const result = service.importCsv(csvText);
        return send(res, 200, result);
      }
      if (req.method === 'GET' && url.pathname === '/available') {
        return send(res, 200, service.listAvailable());
      }
      if (req.method === 'POST' && url.pathname === '/allocations') {
        const body = await readJson(req);
        const alloc = service.allocate(body);
        return send(res, 201, {
          id: alloc.id,
          status: alloc.status,
          amountCents: alloc.amountCents.toString(),
        });
      }
      if (req.method === 'GET' && url.pathname === '/exceptions') {
        return send(res, 200, service.listExceptions());
      }
      if (
        req.method === 'POST' &&
        url.pathname.startsWith('/exceptions/') &&
        url.pathname.endsWith('/resolve')
      ) {
        const id = url.pathname.split('/')[2];
        service.resolveException(id);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/trail') {
        const t = service.getTrail();
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
        });
      }
      if (req.method === 'GET' && url.pathname === '/packet') {
        return send(res, 200, service.getPacket());
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
  const orgId = process.env.ORG_ID || 'org_demo';
  const service = createService({ orgId });
  const server = createAllocationServer({ service });
  const port = Number(process.env.PORT || 8787);
  server.listen(port, () => {
    console.log(`allocation-middleware on http://127.0.0.1:${port} org=${orgId}`);
  });
}
