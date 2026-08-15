import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createService } from '../src/app/service.mjs';
import { createAllocationServer } from '../src/http/server.mjs';

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function start(opts = {}) {
  const service = createService({
    orgId: 'org_1',
    idgen: () => 'fixed-id',
    now: () => '2026-08-03T12:00:00Z',
  });
  const server = createAllocationServer({ service, ...opts });
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

test('operator token required when configured', async () => {
  const base = await start({ operatorToken: 'secret' });
  const denied = await fetch(`${base}/allocations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      campaignKey: 'general',
      programKey: 'undesignated',
      amount: '1.00',
      purpose: 'x',
      approvedBy: 'a',
    }),
  });
  assert.equal(denied.status, 401);
});

test('healthz is ok', async () => {
  const base = await start();
  const res = await fetch(`${base}/healthz`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('configured operational reads fail closed without authentication', async () => {
  const base = await start({ operatorToken: 'read-secret' });
  for (const route of ['/available', '/labels', '/exceptions', '/trail', '/packet', '/setup']) {
    const res = await fetch(`${base}${route}`);
    assert.equal(res.status, 401, route);
  }
  const allowed = await fetch(`${base}/available`, {
    headers: { 'x-operator-token': 'read-secret' },
  });
  assert.equal(allowed.status, 200);
});

test('webhook token reject when configured', async () => {
  const base = await start({ webhookToken: 'expected-webhook-token' });
  const denied = await fetch(`${base}/webhooks/every-org`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chargeId: 'x', amount: '1.00', netAmount: '1.00' }),
  });
  assert.equal(denied.status, 401);
  const allowed = await fetch(`${base}/webhooks/every-org`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-token': 'expected-webhook-token' },
    body: JSON.stringify({
      chargeId: 'wh-token-1',
      amount: '5.00',
      netAmount: '5.00',
      currency: 'USD',
      donationDate: '2026-08-15T00:00:00Z',
    }),
  });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).created, true);
});

test('webhook fail-closed on malformed JSON when token configured', async () => {
  const base = await start({ webhookToken: 'expected-webhook-token' });
  const res = await fetch(`${base}/webhooks/every-org`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-token': 'expected-webhook-token' },
    body: '{not-json',
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'malformed_payload' });
});

test('request bodies over the configured limit are rejected with 413', async () => {
  const base = await start({ maxJsonBodyBytes: 64 });
  const res = await fetch(`${base}/webhooks/every-org`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chargeId: 'x', padding: 'a'.repeat(256) }),
  });
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: 'PAYLOAD_TOO_LARGE' });
});
