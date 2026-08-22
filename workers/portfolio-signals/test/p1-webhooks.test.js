import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { handleWorkerRequest } from '../src/index.js';
import { createMemoryIngest } from '../src/gift-webhook.js';
import { hmacSha256Hex } from '../../../services/allocation-middleware/src/connectors/crypto.mjs';
import { createService } from '../../../services/allocation-middleware/src/app/service.mjs';
import { createMemoryStore } from '../../../services/allocation-middleware/src/app/store-core.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/spec-026');
const GB_SECRET = 'test-givebutter-secret-16';
const DB_SECRET = 'test-donorbox-secret-16';

async function loadJson(rel) {
  return JSON.parse(await readFile(join(root, rel), 'utf8'));
}

function request(path, { method = 'POST', headers = {}, body } = {}) {
  return new Request(`https://portfolio-signals.example${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function postGivebutter(env, body, extraHeaders = {}, options = {}) {
  return handleWorkerRequest(
    request('/webhooks/givebutter', {
      headers: { 'content-type': 'application/json', Signature: GB_SECRET, ...extraHeaders },
      body,
    }),
    { GIVEBUTTER_WEBHOOK_SECRET: GB_SECRET, ...env },
    { ingest: options.ingest || createMemoryIngest('org_hacker_dojo') },
  );
}

async function signedDonorbox(body, { secret = DB_SECRET, now = 1_700_000_000_000, bad = false } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const ts = String(Math.floor(now / 1000));
  const sig = bad ? 'deadbeef' : await hmacSha256Hex(secret, `${ts}.${raw}`);
  return handleWorkerRequest(
    request('/webhooks/donorbox', {
      headers: {
        'content-type': 'application/json',
        'Donorbox-Signature': `${ts},${sig}`,
      },
      body: raw,
    }),
    { DONORBOX_WEBHOOK_SECRET: secret },
    { ingest: createMemoryIngest('org_hacker_dojo'), now },
  );
}

test('Givebutter happy path credits net and is idempotent on chargeId', async () => {
  const payload = await loadJson('givebutter/transaction-succeeded.json');
  const ingest = createMemoryIngest('org_hacker_dojo');
  const first = await handleWorkerRequest(
    request('/webhooks/givebutter', {
      headers: { 'content-type': 'application/json', Signature: GB_SECRET },
      body: payload,
    }),
    { GIVEBUTTER_WEBHOOK_SECRET: GB_SECRET },
    { ingest },
  );
  const replay = await handleWorkerRequest(
    request('/webhooks/givebutter', {
      headers: { 'content-type': 'application/json', Signature: GB_SECRET },
      body: payload,
    }),
    { GIVEBUTTER_WEBHOOK_SECRET: GB_SECRET },
    { ingest },
  );
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { created: true });
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { created: false });
});

test('Givebutter bad Signature is fail-closed', async () => {
  const payload = await loadJson('givebutter/transaction-succeeded.json');
  const ingest = createMemoryIngest('org_hacker_dojo');
  const res = await postGivebutter({}, payload, { Signature: 'wrong' }, { ingest });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'UNAUTHORIZED' });
});

test('Givebutter missing opt-in does not store email', async () => {
  const payload = await loadJson('givebutter/transaction-succeeded-no-opt-in.json');
  const store = createMemoryStore();
  const service = createService({ orgId: 'org_hacker_dojo', store });
  const res = await handleWorkerRequest(
    request('/webhooks/givebutter', {
      headers: { 'content-type': 'application/json', Signature: GB_SECRET },
      body: payload,
    }),
    { GIVEBUTTER_WEBHOOK_SECRET: GB_SECRET },
    { ingest: (body) => service.ingestGift(body, { source: 'givebutter' }) },
  );
  assert.equal(res.status, 200);
  const state = await store.load();
  assert.equal(state.gifts.size, 1);
  assert.equal(state.giftContacts.size, 0);
});

test('Givebutter refund.created does not debit the pot', async () => {
  const created = await loadJson('givebutter/transaction-succeeded.json');
  const refund = await loadJson('givebutter/refund-created.json');
  const store = createMemoryStore();
  const service = createService({ orgId: 'org_hacker_dojo', store });
  const ingest = (body) => service.ingestGift(body, { source: 'givebutter' });
  await handleWorkerRequest(
    request('/webhooks/givebutter', {
      headers: { 'content-type': 'application/json', Signature: GB_SECRET },
      body: created,
    }),
    { GIVEBUTTER_WEBHOOK_SECRET: GB_SECRET },
    { ingest },
  );
  const afterRefund = await handleWorkerRequest(
    request('/webhooks/givebutter', {
      headers: { 'content-type': 'application/json', Signature: GB_SECRET },
      body: refund,
    }),
    { GIVEBUTTER_WEBHOOK_SECRET: GB_SECRET },
    { ingest },
  );
  assert.equal(afterRefund.status, 200);
  assert.deepEqual(await afterRefund.json(), { created: false });
  const pot = (await service.listAvailable())[0];
  assert.equal(pot.credited, '250.00');
});

test('Donorbox happy path uses donation id not stripe_charge_id', async () => {
  const payload = await loadJson('donorbox/donation-created-v2.json');
  const res = await signedDonorbox(payload);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { created: true });
});

test('Donorbox bad signature is fail-closed', async () => {
  const payload = await loadJson('donorbox/donation-created-v2.json');
  const res = await signedDonorbox(payload, { bad: true });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'UNAUTHORIZED' });
});

test('Donorbox fee-absent net equals amount', async () => {
  const payload = await loadJson('donorbox/donation-created-no-fee.json');
  const store = createMemoryStore();
  const service = createService({ orgId: 'org_hacker_dojo', store });
  const raw = JSON.stringify(payload);
  const now = 1_700_000_000_000;
  const ts = String(Math.floor(now / 1000));
  const sig = await hmacSha256Hex(DB_SECRET, `${ts}.${raw}`);
  const res = await handleWorkerRequest(
    request('/webhooks/donorbox', {
      headers: {
        'content-type': 'application/json',
        'Donorbox-Signature': `${ts},${sig}`,
      },
      body: raw,
    }),
    { DONORBOX_WEBHOOK_SECRET: DB_SECRET },
    { ingest: (body) => service.ingestGift(body, { source: 'donorbox' }), now },
  );
  assert.equal(res.status, 200);
  const pot = (await service.listAvailable())[0];
  assert.equal(pot.credited, '40.00');
  assert.equal((await service.getTrail()).gifts[0].chargeId, '9002');
});

test('unknown webhook path stays 404 including Stripe', async () => {
  const stripe = await handleWorkerRequest(
    request('/webhooks/stripe', { body: { type: 'checkout.session.completed' } }),
    { WEBHOOK_TOKEN: 'test-webhook-token-16' },
  );
  assert.equal(stripe.status, 404);
});

test('every.org path remains available', async () => {
  const payload = await loadJson('every-org/gift-completed.json');
  const res = await handleWorkerRequest(
    request('/webhooks/every-org', {
      headers: { 'content-type': 'application/json', 'x-webhook-token': 'test-webhook-token-16' },
      body: payload,
    }),
    { WEBHOOK_TOKEN: 'test-webhook-token-16' },
    { ingest: createMemoryIngest('org_hacker_dojo') },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { created: true });
});
