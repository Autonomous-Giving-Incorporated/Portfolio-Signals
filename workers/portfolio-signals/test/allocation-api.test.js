import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleWorkerRequest } from '../src/index.js';
import { createService } from '../../../services/allocation-middleware/src/app/service.mjs';
import { createMemoryStore } from '../../../services/allocation-middleware/src/app/store-core.mjs';
import { seedFromObject } from '../../../services/allocation-middleware/src/app/seed.mjs';
import fixture from '../../../services/allocation-middleware/fixtures/hacker-dojo-pilot.json' with { type: 'json' };

function jwt(aal = 'aal2') {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ aal })}.signature`;
}

function mockVerifier({
  canWrite = true,
  canRead = true,
  aal = 'aal2',
  mfaEnforced = true,
  role = 'director',
} = {}) {
  return {
    async resolve(req) {
      const auth = req.headers?.get?.('authorization') || '';
      if (!auth.startsWith('Bearer ')) return null;
      if (!canRead) return null;
      return {
        canRead: true,
        canWrite,
        aal,
        mfaEnforced,
        role,
        email: 'director@hackerdojo.org',
        displayName: 'Director',
        clientId: 'org_hacker_dojo',
        source: 'client_memberships',
      };
    },
  };
}

function request(path, { method = 'GET', headers = {}, body } = {}) {
  return new Request(`https://portfolio-signals.example${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function withRuntime(init, options = {}) {
  const store = options.store || createMemoryStore();
  const service = options.service || createService({
    orgId: 'org_hacker_dojo',
    store,
    idgen: options.idgen || (() => 'alloc-worker-1'),
    now: () => '2026-08-15T12:00:00Z',
  });
  return handleWorkerRequest(request(init.path, init), options.env || {}, {
    service,
    authVerifier: options.authVerifier === undefined ? mockVerifier() : options.authVerifier,
  });
}

test('healthz does not require store or JWT', async () => {
  const res = await handleWorkerRequest(request('/healthz'), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.host, 'cloudflare-workers');
});

test('auth/config keeps operator-token fallback off', async () => {
  const res = await handleWorkerRequest(request('/auth/config'), {
    ORG_ID: 'org_hacker_dojo',
    PLATFORM_SUPABASE_URL: 'https://example.supabase.co',
    PLATFORM_SUPABASE_ANON_KEY: 'anon-public',
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.orgId, 'org_hacker_dojo');
  assert.equal(body.operatorTokenFallback, false);
  assert.equal(body.host, 'cloudflare-workers');
  assert.equal(body.supabaseAnonKey, 'anon-public');
});

test('allocations fail closed without JWT', async () => {
  const res = await withRuntime({
    path: '/allocations',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      campaignKey: 'hacker-dojo-420k',
      programKey: 'community-hardware-fund',
      amount: '100.00',
      purpose: 'Seed loop',
    },
  });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'valid_bearer_session_required');
});

test('operator token is rejected on the Worker host', async () => {
  const res = await withRuntime({
    path: '/allocations',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-operator-token': 'legacy-operator-token-16',
    },
    body: {
      campaignKey: 'hacker-dojo-420k',
      programKey: 'community-hardware-fund',
      amount: '100.00',
      purpose: 'Should fail',
    },
  });
  assert.equal(res.status, 401);
});

test('AAL1 session cannot allocate', async () => {
  const res = await withRuntime(
    {
      path: '/allocations',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwt('aal1')}`,
      },
      body: {
        campaignKey: 'hacker-dojo-420k',
        programKey: 'community-hardware-fund',
        amount: '100.00',
        purpose: 'AAL1',
      },
    },
    { authVerifier: mockVerifier({ canWrite: false, aal: 'aal1' }) },
  );
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'aal2_session_required');
});

test('missing persist bindings fail closed', async () => {
  const res = await handleWorkerRequest(
    request('/allocations', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwt('aal2')}`,
      },
      body: { campaignKey: 'hacker-dojo-420k', programKey: 'community-hardware-fund', amount: '1.00', purpose: 'x' },
    }),
    { ORG_ID: 'org_hacker_dojo' },
  );
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'allocation_store_unavailable');
});

test('seed allocate proof packet on org_hacker_dojo fixture', async () => {
  const store = createMemoryStore();
  const service = createService({
    orgId: 'org_hacker_dojo',
    store,
    idgen: (() => {
      let n = 0;
      return () => `alloc-seed-${++n}`;
    })(),
    now: () => '2026-08-15T12:00:00Z',
  });
  const env = {};
  const authVerifier = mockVerifier();
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${jwt('aal2')}`,
  };

  const seeded = await handleWorkerRequest(
    request('/seed', { method: 'POST', headers }),
    env,
    { service, authVerifier },
  );
  assert.equal(seeded.status, 200);
  const seedBody = await seeded.json();
  assert.equal(seedBody.seeded, true);
  assert.equal(seedBody.orgId, 'org_hacker_dojo');
  assert.equal(seedBody.liveGift, false);
  assert.equal(seedBody.giftsCreated, 4);

  const allocated = await handleWorkerRequest(
    request('/allocations', {
      method: 'POST',
      headers,
      body: {
        campaignKey: 'hacker-dojo-420k',
        programKey: 'community-hardware-fund',
        amount: '100.00',
        purpose: 'Community hardware kits',
      },
    }),
    env,
    { service, authVerifier },
  );
  assert.equal(allocated.status, 201);
  const alloc = await allocated.json();
  assert.equal(alloc.status, 'approved');
  assert.equal(alloc.approvedBy, 'director@hackerdojo.org');

  const proof = await handleWorkerRequest(
    request('/proofs', {
      method: 'POST',
      headers,
      body: {
        allocationId: alloc.id,
        uri: 'https://example.com/evidence/seed-acceptance-receipt.pdf',
        note: 'Seed fixture proof (no live gift)',
      },
    }),
    env,
    { service, authVerifier },
  );
  assert.equal(proof.status, 201);

  const packet = await handleWorkerRequest(
    request('/packet', { headers: { authorization: `Bearer ${jwt('aal2')}` } }),
    env,
    { service, authVerifier },
  );
  assert.equal(packet.status, 200);
  const body = await packet.json();
  assert.equal(body.orgId, 'org_hacker_dojo');
  assert.ok(body.allocations.some((row) => row.id === alloc.id && row.proofCount >= 1));
  assert.equal(body.totals.credited, '19000.00');
});

test('seedFromObject is idempotent on fixture chargeIds', async () => {
  const service = createService({ orgId: 'org_hacker_dojo', store: createMemoryStore() });
  const first = await seedFromObject(service, fixture, { applySuggestedAllocation: false });
  const second = await seedFromObject(service, fixture, { applySuggestedAllocation: false });
  assert.equal(first.giftsCreated, 4);
  assert.equal(second.giftsCreated, 0);
});
