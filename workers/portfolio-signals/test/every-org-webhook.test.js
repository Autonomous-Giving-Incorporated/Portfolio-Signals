import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleWorkerRequest } from '../src/index.js';
import { createMemoryIngest } from '../src/every-org-webhook.js';

const FIXTURE = {
  chargeId: 'fixture-worker-gift-001',
  amount: '25.00',
  netAmount: '24.25',
  currency: 'USD',
  donationDate: '2026-08-15T00:00:00Z',
  toNonprofit: { slug: 'hacker-dojo', name: 'Hacker Dojo' },
  fromFundraiser: { title: 'Community Hardware Fund', slug: 'community-hardware-fund' },
};

const TOKEN = 'test-webhook-token-16';

function webhookRequest(path, { method = 'POST', headers = {}, body } = {}) {
  return new Request(`https://portfolio-signals.example${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function postWebhook(env, init, options = {}) {
  const request = webhookRequest('/webhooks/every-org', init);
  return handleWorkerRequest(request, env, { ingest: createMemoryIngest('org_hacker_dojo'), ...options });
}

test('rejects missing webhook token', async () => {
  const res = await postWebhook({ WEBHOOK_TOKEN: TOKEN }, { body: FIXTURE });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'UNAUTHORIZED' });
});

test('rejects wrong webhook token', async () => {
  const res = await postWebhook(
    { WEBHOOK_TOKEN: TOKEN },
    { headers: { 'x-webhook-token': 'nope' }, body: FIXTURE },
  );
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'UNAUTHORIZED' });
});

test('rejects when webhook token is unconfigured', async () => {
  const res = await postWebhook({}, { headers: { 'x-webhook-token': TOKEN }, body: FIXTURE });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'webhook_token_unconfigured' });
});

test('accepts valid header token and credits fixture gift', async () => {
  const ingest = createMemoryIngest('org_hacker_dojo');
  const res = await handleWorkerRequest(
    webhookRequest('/webhooks/every-org', {
      headers: { 'x-webhook-token': TOKEN },
      body: FIXTURE,
    }),
    { WEBHOOK_TOKEN: TOKEN },
    { ingest },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { created: true });

  const replay = await handleWorkerRequest(
    webhookRequest('/webhooks/every-org', {
      headers: { 'x-webhook-token': TOKEN },
      body: FIXTURE,
    }),
    { WEBHOOK_TOKEN: TOKEN },
    { ingest },
  );
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { created: false });
});

test('accepts valid query token', async () => {
  const res = await handleWorkerRequest(
    webhookRequest(`/webhooks/every-org?token=${encodeURIComponent(TOKEN)}`, { body: FIXTURE }),
    { WEBHOOK_TOKEN: TOKEN },
    { ingest: createMemoryIngest('org_hacker_dojo') },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { created: true });
});

test('fail-closed on malformed JSON', async () => {
  const res = await postWebhook(
    { WEBHOOK_TOKEN: TOKEN },
    { headers: { 'x-webhook-token': TOKEN }, body: '{not-json' },
  );
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'malformed_payload' });
});

test('fail-closed on non-object JSON payload', async () => {
  const res = await postWebhook(
    { WEBHOOK_TOKEN: TOKEN },
    { headers: { 'x-webhook-token': TOKEN }, body: '[]' },
  );
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'malformed_payload' });
});

test('fail-closed when chargeId is missing', async () => {
  const res = await postWebhook(
    { WEBHOOK_TOKEN: TOKEN },
    { headers: { 'x-webhook-token': TOKEN }, body: { amount: '1.00' } },
  );
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'chargeId required' });
});

test('rejects oversized payload', async () => {
  const res = await postWebhook(
    { WEBHOOK_TOKEN: TOKEN },
    { headers: { 'x-webhook-token': TOKEN }, body: { chargeId: 'x', padding: 'a'.repeat(300) } },
    { maxJsonBodyBytes: 64 },
  );
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: 'PAYLOAD_TOO_LARGE' });
});

test('GET webhook is not allowed', async () => {
  const res = await handleWorkerRequest(
    webhookRequest('/webhooks/every-org', { method: 'GET' }),
    { WEBHOOK_TOKEN: TOKEN },
  );
  assert.equal(res.status, 405);
});

test('unknown webhook path is not found', async () => {
  const res = await handleWorkerRequest(
    webhookRequest('/webhooks/other', { body: FIXTURE }),
    { WEBHOOK_TOKEN: TOKEN },
  );
  assert.equal(res.status, 404);
});

test('fail-closed when production persist bindings are missing', async () => {
  const res = await handleWorkerRequest(
    webhookRequest('/webhooks/every-org', {
      headers: { 'x-webhook-token': TOKEN },
      body: FIXTURE,
    }),
    { WEBHOOK_TOKEN: TOKEN },
  );
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'allocation_store_unavailable' });
});
