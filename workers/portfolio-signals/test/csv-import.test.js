import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleWorkerRequest } from '../src/index.js';
import { createService } from '../../../services/allocation-middleware/src/app/service.mjs';
import { createMemoryStore } from '../../../services/allocation-middleware/src/app/store-core.mjs';

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

function request(path, { method = 'POST', headers = {}, body } = {}) {
  return new Request(`https://portfolio-signals.example${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function directorHeaders(contentType = 'text/csv') {
  return {
    'content-type': contentType,
    authorization: `Bearer ${jwt('aal2')}`,
  };
}

async function postCsv(csv, options = {}) {
  const store = options.store || createMemoryStore();
  const service = options.service || createService({
    orgId: 'org_hacker_dojo',
    store,
    now: () => '2026-08-15T12:00:00Z',
  });
  const res = await handleWorkerRequest(
    request('/import/csv', {
      method: 'POST',
      headers: options.headers === undefined ? directorHeaders() : options.headers,
      body: csv,
    }),
    options.env || {},
    {
      service,
      authVerifier: options.authVerifier === undefined ? mockVerifier() : options.authVerifier,
      maxCsvBodyBytes: options.maxCsvBodyBytes,
    },
  );
  return { res, service, store };
}

const HAPPY_CSV =
  'chargeId,netAmount,campaignKey,programKey,currency,donatedAt\n' +
  'csv-worker-001,25.00,hacker-dojo-420k,community-hardware-fund,USD,2026-08-15T00:00:00Z\n';

test('CSV happy path credits netAmount once and does not allocate', async () => {
  const { res, service } = await postCsv(HAPPY_CSV);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { created: 1, total: 1 });

  const available = await service.listAvailable();
  const pot = available.find(
    (row) =>
      row.campaignKey === 'hacker-dojo-420k' && row.programKey === 'community-hardware-fund',
  );
  assert.ok(pot);
  assert.equal(pot.available, '25.00');
  assert.equal(pot.credited, '25.00');
  assert.equal(pot.allocated, '0.00');

  const trail = await service.getTrail();
  assert.equal(trail.gifts.length, 1);
  assert.equal(trail.gifts[0].chargeId, 'csv-worker-001');
  assert.equal(trail.gifts[0].source, 'csv');
  assert.equal(trail.allocations.length, 0);
});

test('duplicate chargeId no-ops and does not double-credit', async () => {
  const store = createMemoryStore();
  const service = createService({
    orgId: 'org_hacker_dojo',
    store,
    now: () => '2026-08-15T12:00:00Z',
  });
  const first = await postCsv(HAPPY_CSV, { service, store });
  const second = await postCsv(HAPPY_CSV, { service, store });
  assert.equal(first.res.status, 200);
  assert.deepEqual(await first.res.json(), { created: 1, total: 1 });
  assert.equal(second.res.status, 200);
  assert.deepEqual(await second.res.json(), { created: 0, total: 1 });

  const pot = (await service.listAvailable()).find(
    (row) => row.programKey === 'community-hardware-fund',
  );
  assert.equal(pot.credited, '25.00');
  assert.equal((await service.getTrail()).gifts.length, 1);
});

test('missing required columns are rejected', async () => {
  const missingCharge = await postCsv('id,amount\ncs_test_123,10.00\n');
  assert.equal(missingCharge.res.status, 400);
  assert.equal((await missingCharge.res.json()).error, 'csv missing column: chargeId');
  assert.equal((await missingCharge.service.getTrail()).gifts.length, 0);

  const missingNet = await postCsv('chargeId,amount\ncsv-no-net,10.00\n');
  assert.equal(missingNet.res.status, 400);
  assert.equal((await missingNet.res.json()).error, 'csv missing column: netAmount');
  assert.equal((await missingNet.service.getTrail()).gifts.length, 0);
});

test('empty CSV body is rejected', async () => {
  const { res } = await postCsv('   ');
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'csv_required');
});

test('unauthenticated CSV import is rejected', async () => {
  const { res, service } = await postCsv(HAPPY_CSV, {
    headers: { 'content-type': 'text/csv' },
  });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'valid_bearer_session_required');
  assert.equal((await service.getTrail()).gifts.length, 0);
});

test('operator token is not a CSV import credential on the Worker', async () => {
  const { res, service } = await postCsv(HAPPY_CSV, {
    headers: {
      'content-type': 'text/csv',
      'x-operator-token': 'legacy-operator-token-16',
    },
  });
  assert.equal(res.status, 401);
  assert.equal((await service.getTrail()).gifts.length, 0);
});

test('optional contact lands only when the CSV supplies it', async () => {
  const contactStore = createMemoryStore();
  const contactService = createService({ orgId: 'org_hacker_dojo', store: contactStore });
  await postCsv(
    'chargeId,netAmount,email,donorPrincipal\ncsv-contact-1,10.00,donor@example.org,donor_1\n',
    { service: contactService, store: contactStore },
  );
  const withContact = await contactStore.load();
  assert.deepEqual(withContact.giftContacts.get('csv-contact-1'), {
    chargeId: 'csv-contact-1',
    email: 'donor@example.org',
    donorPrincipal: 'donor_1',
  });

  const bareStore = createMemoryStore();
  const bareService = createService({ orgId: 'org_hacker_dojo', store: bareStore });
  await postCsv('chargeId,netAmount\ncsv-bare-1,10.00\n', { service: bareService, store: bareStore });
  const bare = await bareStore.load();
  assert.equal(bare.gifts.size, 1);
  assert.equal(bare.giftContacts.size, 0);
});

test('Stripe-shaped CSV rows do not become a Stripe processor path', async () => {
  const stripeShaped =
    'chargeId,netAmount,stripeCheckoutSession,processor\n' +
    'ch_stripe_lookalike,15.00,cs_test_123,stripe\n';
  const { res, service } = await postCsv(stripeShaped);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { created: 1, total: 1 });

  const trail = await service.getTrail();
  assert.equal(trail.gifts.length, 1);
  assert.equal(trail.gifts[0].source, 'csv');
  assert.notEqual(trail.gifts[0].source, 'stripe');

  const stripeHook = await handleWorkerRequest(
    request('/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: {
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test_123' } },
      },
    }),
    { WEBHOOK_TOKEN: 'test-webhook-token-16' },
    { service },
  );
  assert.equal(stripeHook.status, 404);
  assert.equal((await service.getTrail()).gifts.length, 1);
  assert.equal((await service.getTrail()).gifts[0].source, 'csv');
});

test('JSON wrapper {csv} is accepted for the same persist path', async () => {
  const { res, service } = await postCsv(
    { csv: HAPPY_CSV },
    { headers: directorHeaders('application/json') },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { created: 1, total: 1 });
  assert.equal((await service.listAvailable())[0].available, '25.00');
});
