import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createService } from '../src/app/service.mjs';
import { createAllocationServer } from '../src/http/server.mjs';

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function start() {
  const service = createService({
    orgId: 'org_1',
    idgen: () => 'fixed-id',
    now: () => '2026-08-03T12:00:00Z',
  });
  const server = createAllocationServer({ service });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test('webhook credits and available reflects gift', async () => {
  const base = await start();
  const wh = await fetch(`${base}/webhooks/every-org`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chargeId: 'wh-1',
      amount: '25.00',
      netAmount: '25.00',
      currency: 'USD',
      donationDate: '2026-08-03T00:00:00Z',
      toNonprofit: { slug: 'x', name: 'X' },
    }),
  });
  assert.equal(wh.status, 200);
  const body = await wh.json();
  assert.equal(body.created, true);
  const av = await (await fetch(`${base}/available`)).json();
  assert.ok(av.some((p) => p.available === '25.00'));
});
