import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createService } from '../src/app/service.mjs';
import { createAllocationServer } from '../src/http/server.mjs';

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

test('setup status flips after first gift', async () => {
  const service = createService({ orgId: 'org_1', idgen: () => 's1' });
  let status = await service.getSetupStatus({
    webhookUrl: 'https://x.example/webhooks/every-org?token=t',
    hasWebhookToken: true,
  });
  assert.equal(status.authModel, 'webhook_url');
  assert.equal(status.steps.receivedTestGift, false);
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
  assert.equal(status.counts.gifts, 1);
  assert.equal(status.lastGift.chargeId, 'setup-gift-1');
});

test('GET /setup returns wizard JSON', async () => {
  const service = createService({ orgId: 'org_1' });
  const server = createAllocationServer({
    service,
    webhookToken: 'whsec',
    publicBaseUrl: 'https://alloc.example.com',
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/setup`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(
    body.webhookUrl,
    'https://alloc.example.com/webhooks/every-org?token=whsec',
  );
  assert.equal(body.connector, 'every.org');
});
