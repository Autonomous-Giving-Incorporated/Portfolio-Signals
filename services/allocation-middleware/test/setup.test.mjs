import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createService } from '../src/app/service.mjs';
import { createAllocationServer } from '../src/http/server.mjs';

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

test('setup status flips after first live gift', async () => {
  const service = createService({ orgId: 'org_1', idgen: () => 's1' });
  let status = await service.getSetupStatus({
    webhookUrl: 'https://x.example/webhooks/every-org?token=t',
    hasWebhookToken: true,
  });
  assert.equal(status.authModel, 'webhook_url');
  assert.equal(status.steps.receivedTestGift, false);
  assert.equal(status.steps.receivedLiveGift, false);
  assert.equal(status.steps.receivedFixtureGifts, false);
  assert.equal(status.instructions.length, 5);

  await service.ingestEveryOrg({
    chargeId: 'setup-gift-1',
    amount: '1.00',
    netAmount: '1.00',
    currency: 'USD',
    donationDate: '2026-08-03T00:00:00Z',
    toNonprofit: { slug: 'x', name: 'X' },
  });
  status = await service.getSetupStatus({
    webhookUrl: 'https://x.example/webhooks/every-org?token=t',
  });
  assert.equal(status.steps.receivedTestGift, true);
  assert.equal(status.steps.receivedLiveGift, true);
  assert.equal(status.counts.gifts, 1);
  assert.equal(status.counts.liveGifts, 1);
  assert.equal(status.counts.fixtureGifts, 0);
  assert.equal(status.lastGift.chargeId, 'setup-gift-1');
  assert.equal(status.lastLiveGift.chargeId, 'setup-gift-1');
  assert.equal(status.lastLiveGift.fixture, false);
});

test('fixture seed gifts do not mark every.org Connected', async () => {
  const service = createService({ orgId: 'org_1', idgen: () => 's1' });
  await service.ingestEveryOrg({
    chargeId: 'fixture-hd-gift-001',
    amount: '10.00',
    netAmount: '10.00',
    currency: 'USD',
    donationDate: '2026-07-15T18:00:00Z',
    toNonprofit: { slug: 'x', name: 'X' },
  });
  const status = await service.getSetupStatus({
    webhookUrl: 'https://x.example/webhooks/every-org?token=t',
    hasWebhookToken: true,
  });
  assert.equal(status.steps.receivedFixtureGifts, true);
  assert.equal(status.steps.receivedTestGift, false);
  assert.equal(status.steps.receivedLiveGift, false);
  assert.equal(status.counts.fixtureGifts, 1);
  assert.equal(status.counts.liveGifts, 0);
  assert.equal(status.lastLiveGift, null);
  assert.equal(status.lastGift.chargeId, 'fixture-hd-gift-001');
  assert.equal(status.lastGift.fixture, true);
});

test('live gift after fixtures marks Connected', async () => {
  const service = createService({ orgId: 'org_1', idgen: () => 's1' });
  await service.ingestEveryOrg({
    chargeId: 'fixture-hd-gift-001',
    amount: '10.00',
    netAmount: '10.00',
    currency: 'USD',
    donationDate: '2026-07-15T18:00:00Z',
    toNonprofit: { slug: 'x', name: 'X' },
  });
  await service.ingestEveryOrg({
    chargeId: 'eo-live-abc123',
    amount: '1.00',
    netAmount: '0.97',
    currency: 'USD',
    donationDate: '2026-08-08T12:00:00Z',
    toNonprofit: { slug: 'x', name: 'X' },
  });
  const status = await service.getSetupStatus({
    webhookUrl: 'https://x.example/webhooks/every-org?token=t',
  });
  assert.equal(status.steps.receivedFixtureGifts, true);
  assert.equal(status.steps.receivedTestGift, true);
  assert.equal(status.counts.gifts, 2);
  assert.equal(status.counts.fixtureGifts, 1);
  assert.equal(status.counts.liveGifts, 1);
  assert.equal(status.lastLiveGift.chargeId, 'eo-live-abc123');
});

test('GET /setup requires operator authorization and never discloses to anonymous callers', async () => {
  const service = createService({ orgId: 'org_1' });
  const server = createAllocationServer({
    service,
    webhookToken: 'whsec',
    operatorToken: 'operator-secret',
    publicBaseUrl: 'https://alloc.example.com',
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/setup`);
  assert.equal(res.status, 401);
  const authorized = await fetch(`http://127.0.0.1:${port}/setup`, {
    headers: { 'x-operator-token': 'operator-secret' },
  });
  assert.equal(authorized.status, 200);
  const body = await authorized.json();
  assert.equal(
    body.webhookUrl,
    'https://alloc.example.com/webhooks/every-org?token=whsec',
  );
  assert.equal(body.connector, 'every.org');
  assert.equal(body.steps.receivedTestGift, false);
  assert.equal(body.counts.liveGifts, 0);
});
