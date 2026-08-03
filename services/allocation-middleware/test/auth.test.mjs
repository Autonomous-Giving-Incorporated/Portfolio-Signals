import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createService } from '../src/app/service.mjs';
import { createAllocationServer } from '../src/http/server.mjs';
import { createAuthVerifier } from '../src/app/auth.mjs';

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

function mockFetchFactory({ userId = '11111111-1111-4111-8111-111111111111', role = 'director' } = {}) {
  return async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/auth/v1/user')) {
      const auth = opts.headers?.authorization || '';
      if (!auth.includes('good-jwt')) {
        return { ok: false, status: 401, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () => ({ id: userId, email: 'director@hackerdojo.org' }),
      };
    }
    if (u.includes('client_memberships')) {
      return {
        ok: true,
        json: async () => [{ role, active: true, client_id: 'org_hacker_dojo' }],
      };
    }
    if (u.includes('profiles')) {
      return { ok: true, json: async () => [] };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

async function start(serverOpts = {}) {
  const service = createService({
    orgId: 'org_hacker_dojo',
    idgen: () => 'alloc-auth-1',
    now: () => '2026-08-03T12:00:00Z',
  });
  await service.ingestEveryOrg({
    chargeId: 'auth-gift',
    amount: '100.00',
    netAmount: '100.00',
    currency: 'USD',
    donationDate: '2026-08-01T00:00:00Z',
    toNonprofit: { slug: 'hacker-dojo', name: 'Hacker Dojo' },
  });
  const authVerifier = createAuthVerifier({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'service-role',
    clientId: 'org_hacker_dojo',
    fetchImpl: mockFetchFactory(),
  });
  const server = createAllocationServer({
    service,
    operatorToken: 'legacy-operator-token-16',
    allowOperatorFallback: true,
    authVerifier,
    authPublic: {
      orgId: 'org_hacker_dojo',
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon',
    },
    ...serverOpts,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

test('director JWT can allocate', async () => {
  const base = await start();
  const res = await fetch(`${base}/allocations`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer good-jwt',
    },
    body: JSON.stringify({
      campaignKey: 'general',
      programKey: 'undesignated',
      amount: '10.00',
      purpose: 'Test',
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.approvedBy, 'director@hackerdojo.org');
});

test('missing JWT denied when supabase auth configured', async () => {
  const base = await start({ allowOperatorFallback: false });
  const res = await fetch(`${base}/allocations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      campaignKey: 'general',
      programKey: 'undesignated',
      amount: '1.00',
      purpose: 'x',
      approvedBy: 'x',
    }),
  });
  assert.equal(res.status, 401);
});

test('auth/me returns director profile', async () => {
  const base = await start();
  const res = await fetch(`${base}/auth/me`, {
    headers: { authorization: 'Bearer good-jwt' },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.role, 'director');
  assert.equal(body.canWrite, true);
});

test('auth/config exposes login flags', async () => {
  const base = await start();
  const res = await fetch(`${base}/auth/config`);
  const body = await res.json();
  assert.equal(body.directorLoginEnabled, true);
  assert.equal(body.orgId, 'org_hacker_dojo');
});
