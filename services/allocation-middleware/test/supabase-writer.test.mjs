import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createSupabaseAllocationWriter } from '../src/app/supabase-writer.mjs';

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/spec-026');

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
    if (url.includes('/rpc/am_credit_pot') && init.method === 'POST') {
      return jsonResponse(200, [{
        client_id: 'org_hacker_dojo',
        campaign_key: 'general',
        program_key: 'undesignated',
        credited_cents: 1000,
        allocated_cents: 0,
        inserted: true,
      }]);
    }
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
  assert.equal(calls.some((c) => String(c.url).includes('/rpc/am_credit_pot') && c.method === 'POST'), true);
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

test('creditPot posts the gift increment to rpc/am_credit_pot and never PATCHES an absolute credited_cents', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body || null });
    if (url.endsWith('/am_webhook_events') && init.method === 'POST') return jsonResponse(201, null);
    if (url.includes('am_gifts?select=charge_id')) return jsonResponse(200, []);
    if (url.endsWith('/am_gifts') && init.method === 'POST') return jsonResponse(201, null);
    if (url.includes('/rpc/am_credit_pot') && init.method === 'POST') {
      return jsonResponse(200, [{
        client_id: 'org_hacker_dojo',
        campaign_key: 'general',
        program_key: 'undesignated',
        credited_cents: 1000,
        allocated_cents: 0,
        inserted: true,
      }]);
    }
    if (url.includes('am_pots')) return jsonResponse(200, []);
    throw new Error(`unexpected ${init.method} ${url}`);
  };
  const writer = createSupabaseAllocationWriter({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'test-service-role',
    orgId: 'org_hacker_dojo',
    fetchImpl,
  });
  assert.deepEqual(await writer.ingestEveryOrg(FIXTURE), { created: true });
  const credit = calls.find((c) => String(c.url).includes('/rpc/am_credit_pot'));
  assert.ok(credit, 'expected POST /rpc/am_credit_pot');
  assert.equal(credit.method, 'POST');
  const body = JSON.parse(credit.body);
  assert.equal(body.p_client_id, 'org_hacker_dojo');
  assert.equal(body.p_campaign_key, 'general');
  assert.equal(body.p_program_key, 'undesignated');
  assert.equal(body.p_credited_cents, 1000);
  assert.equal(calls.some((c) => c.method === 'PATCH' && String(c.url).includes('am_pots')), false);
  assert.equal(calls.some((c) => c.method === 'GET' && String(c.url).includes('am_pots?select=')), false);
  assert.equal(
    calls.some((c) => c.method === 'POST' && String(c.url).endsWith('/am_pots')),
    false,
  );
});

test('overlapping credits each send their own increment, not a computed pot total', async () => {
  const calls = [];
  const seenCharges = new Set();
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body || null });
    if (url.endsWith('/am_webhook_events') && init.method === 'POST') return jsonResponse(201, null);
    if (url.includes('am_gifts?select=charge_id')) return jsonResponse(200, []);
    if (url.endsWith('/am_gifts') && init.method === 'POST') return jsonResponse(201, null);
    if (url.includes('/rpc/am_credit_pot') && init.method === 'POST') {
      const increment = JSON.parse(init.body).p_credited_cents;
      return jsonResponse(200, [{
        client_id: 'org_hacker_dojo',
        campaign_key: 'general',
        program_key: 'undesignated',
        credited_cents: increment,
        allocated_cents: 0,
        inserted: seenCharges.size === 0,
      }]);
    }
    if (url.includes('am_pots?select=')) {
      return jsonResponse(200, seenCharges.size === 0 ? [] : [{ credited_cents: 1000, allocated_cents: 0 }]);
    }
    if (url.includes('am_pots') && (init.method === 'POST' || init.method === 'PATCH')) {
      return jsonResponse(init.method === 'POST' ? 201 : 200, null);
    }
    throw new Error(`unexpected ${init.method} ${url}`);
  };
  const writer = createSupabaseAllocationWriter({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'test-service-role',
    orgId: 'org_hacker_dojo',
    fetchImpl,
  });
  assert.deepEqual(await writer.ingestEveryOrg({ ...FIXTURE, chargeId: 'overlap-a' }), { created: true });
  seenCharges.add('overlap-a');
  assert.deepEqual(
    await writer.ingestEveryOrg({ ...FIXTURE, chargeId: 'overlap-b', netAmount: '15.00', amount: '15.00' }),
    { created: true },
  );
  const rpcBodies = calls
    .filter((c) => String(c.url).includes('/rpc/am_credit_pot'))
    .map((c) => JSON.parse(c.body));
  assert.deepEqual(
    rpcBodies.map((body) => body.p_credited_cents),
    [1000, 1500],
  );
  const absoluteWrites = calls
    .filter((c) => (c.method === 'POST' || c.method === 'PATCH') && String(c.url).includes('am_pots') && !String(c.url).includes('/rpc/'))
    .map((c) => (c.body ? JSON.parse(c.body) : {}));
  assert.equal(
    absoluteWrites.some((body) => Object.hasOwn(body, 'credited_cents')),
    false,
    'must not write an absolute credited_cents from a prior read',
  );
});

test('new non-general pot from am_credit_pot still opens UNMAPPED_FUNDRAISER', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body || null });
    if (url.endsWith('/am_webhook_events') && init.method === 'POST') return jsonResponse(201, null);
    if (url.includes('am_gifts?select=charge_id')) return jsonResponse(200, []);
    if (url.endsWith('/am_gifts') && init.method === 'POST') return jsonResponse(201, null);
    if (url.includes('/rpc/am_credit_pot') && init.method === 'POST') {
      return jsonResponse(200, [{
        client_id: 'org_hacker_dojo',
        campaign_key: 'spring gala',
        program_key: 'undesignated',
        credited_cents: 1000,
        allocated_cents: 0,
        inserted: true,
      }]);
    }
    if (url.includes('am_exceptions')) return jsonResponse(201, null);
    throw new Error(`unexpected ${init.method} ${url}`);
  };
  const writer = createSupabaseAllocationWriter({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'test-service-role',
    orgId: 'org_hacker_dojo',
    fetchImpl,
  });
  const result = await writer.ingestEveryOrg({
    ...FIXTURE,
    chargeId: 'unmapped-gala-001',
    fromFundraiser: { title: 'Spring Gala' },
  });
  assert.equal(result.created, true);
  const exception = JSON.parse(calls.find((c) => String(c.url).includes('am_exceptions')).body);
  assert.equal(exception.code, 'UNMAPPED_FUNDRAISER');
  assert.equal(JSON.parse(calls.find((c) => String(c.url).includes('/rpc/am_credit_pot')).body).p_campaign_key, 'spring gala');
});

test('Donorbox v1 chargeback array writes SYNC_FAILURE and never credits a pot', async () => {
  const payload = JSON.parse(await readFile(join(fixtureRoot, 'donorbox/chargeback-v1-array.json'), 'utf8'));
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (url.endsWith('/am_webhook_events') && init.method === 'POST') return jsonResponse(201, null);
    if (url.startsWith('https://example.supabase.co/rest/v1/am_exceptions')) return jsonResponse(201, null);
    throw new Error(`unexpected ${init.method} ${url}`);
  };
  const writer = createSupabaseAllocationWriter({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'test-service-role',
    orgId: 'org_hacker_dojo',
    fetchImpl,
  });
  const result = await writer.ingestGift(payload, { source: 'donorbox' });
  assert.equal(result.created, false);
  assert.equal(result.exception.code, 'SYNC_FAILURE');
  assert.equal(calls.some((c) => c.url.includes('am_gifts') || c.url.includes('am_pots')), false);
});
