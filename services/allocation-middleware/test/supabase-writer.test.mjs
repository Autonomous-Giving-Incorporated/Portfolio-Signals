import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSupabaseAllocationWriter } from '../src/app/supabase-writer.mjs';

const FIXTURE = {
  chargeId: 'fixture-supabase-gift-001',
  amount: '10.00',
  netAmount: '10.00',
  currency: 'USD',
  donationDate: '2026-08-15T00:00:00Z',
  toNonprofit: { slug: 'hacker-dojo', name: 'Hacker Dojo' },
};

function jsonResponse(status, body, extra = {}) {
  return new Response(body == null ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extra },
  });
}

test('createSupabaseAllocationWriter fail-closed without bindings', () => {
  assert.throws(
    () => createSupabaseAllocationWriter({ supabaseUrl: '', serviceRoleKey: 'x', orgId: 'org_hacker_dojo' }),
    { message: 'allocation_store_unavailable' },
  );
});

function okStore(calls) {
  return async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body || null });
    if (url.endsWith('/am_webhook_events') && init.method === 'POST') return jsonResponse(201, null);
    if (url.includes('am_gifts?select=charge_id')) return jsonResponse(200, []);
    if (url.endsWith('/am_gifts') && init.method === 'POST') return jsonResponse(201, null);
    if (url.includes('am_pots?select=')) return jsonResponse(200, []);
    if (url.endsWith('/am_pots') && init.method === 'POST') return jsonResponse(201, null);
    if (url.includes('am_gift_contacts')) return jsonResponse(201, null);
    if (url.includes('am_exceptions')) return jsonResponse(201, null);
    throw new Error(`unexpected ${init.method} ${url}`);
  };
}

test('ingestEveryOrg inserts gift then credits pot', async () => {
  const calls = [];
  const fetchImpl = okStore(calls);
  const writer = createSupabaseAllocationWriter({
    supabaseUrl: 'https://utdioxwiskzatwoejgiu.supabase.co',
    serviceRoleKey: 'test-service-role',
    orgId: 'org_hacker_dojo',
    fetchImpl,
  });
  const result = await writer.ingestEveryOrg(FIXTURE);
  assert.deepEqual(result, { created: true });
  assert.equal(calls.some((c) => c.url.endsWith('/am_webhook_events') && c.method === 'POST'), true);
  assert.equal(calls.some((c) => c.url.endsWith('/am_gifts') && c.method === 'POST'), true);
  assert.equal(calls.some((c) => c.url.endsWith('/am_pots') && c.method === 'POST'), true);
  const giftBody = JSON.parse(calls.find((c) => c.url.endsWith('/am_gifts')).body);
  assert.equal(giftBody.charge_id, 'fixture-supabase-gift-001');
  assert.equal(giftBody.client_id, 'org_hacker_dojo');
  assert.equal(giftBody.net_cents, 1000);
  assert.equal('email' in giftBody, false);
  assert.equal(calls.some((c) => String(c.url).includes('am_gift_contacts')), false);
});

test('ingestEveryOrg persists connector contact off the gift row', async () => {
  const calls = [];
  const fetchImpl = okStore(calls);
  const writer = createSupabaseAllocationWriter({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'test-service-role',
    orgId: 'org_hacker_dojo',
    fetchImpl,
  });
  await writer.ingestEveryOrg({ ...FIXTURE, email: 'donor@example.org', donorId: 'donor_1' });
  const giftBody = JSON.parse(calls.find((c) => c.url.endsWith('/am_gifts')).body);
  assert.equal('email' in giftBody, false);
  const contactBody = JSON.parse(calls.find((c) => String(c.url).includes('am_gift_contacts')).body);
  assert.equal(contactBody.email, 'donor@example.org');
  assert.equal(contactBody.donor_principal, 'donor_1');
  assert.equal(contactBody.charge_id, 'fixture-supabase-gift-001');
});

test('ingestEveryOrg is idempotent when charge_id already exists', async () => {
  const fetchImpl = async (url, init = {}) => {
    if (url.endsWith('/am_webhook_events') && init.method === 'POST') return jsonResponse(201, null);
    if (url.includes('am_gifts?select=charge_id')) {
      return jsonResponse(200, [{ charge_id: 'fixture-supabase-gift-001' }]);
    }
    throw new Error(`unexpected ${url}`);
  };
  const writer = createSupabaseAllocationWriter({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'test-service-role',
    orgId: 'org_hacker_dojo',
    fetchImpl,
  });
  assert.deepEqual(await writer.ingestEveryOrg(FIXTURE), { created: false });
});

test('ingestEveryOrg fail-closed on store errors', async () => {
  const fetchImpl = async () => jsonResponse(500, { error: 'nope' });
  const writer = createSupabaseAllocationWriter({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'test-service-role',
    orgId: 'org_hacker_dojo',
    fetchImpl,
  });
  await assert.rejects(() => writer.ingestEveryOrg(FIXTURE), { message: 'allocation_store_unavailable' });
});

test('non-USD gift writes an exception and does not create a gift', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (url.endsWith('/am_webhook_events') && init.method === 'POST') return jsonResponse(201, null);
    if (url.startsWith('https://example.supabase.co/rest/v1/am_exceptions')) {
      return jsonResponse(201, null);
    }
    throw new Error(`unexpected ${url}`);
  };
  const writer = createSupabaseAllocationWriter({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'test-service-role',
    orgId: 'org_hacker_dojo',
    fetchImpl,
  });
  const result = await writer.ingestEveryOrg({ ...FIXTURE, currency: 'EUR' });
  assert.equal(result.created, false);
  assert.equal(result.exception.code, 'CURRENCY_MISMATCH');
  assert.equal(calls.some((c) => c.url.includes('am_gifts')), false);
});
