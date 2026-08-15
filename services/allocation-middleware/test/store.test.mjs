import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createService } from '../src/app/service.mjs';
import { createFileStore, deserializeState } from '../src/app/store.mjs';

test('file store persists gifts across service instances', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'alloc-'));
  const file = path.join(dir, 'state.json');
  const store = createFileStore(file);
  const svc1 = createService({ orgId: 'org_1', store, idgen: () => 'a1' });
  await svc1.ingestEveryOrg({
    chargeId: 'persist-1',
    amount: '5.00',
    netAmount: '5.00',
    currency: 'USD',
    donationDate: '2026-08-03T00:00:00Z',
    toNonprofit: { slug: 'x', name: 'X' },
  });
  await svc1.ingestEveryOrg({
    chargeId: 'persist-2',
    amount: '3.00',
    netAmount: '3.00',
    currency: 'USD',
    donationDate: '2026-08-03T00:01:00Z',
    toNonprofit: { slug: 'y', name: 'Y' },
  });
  const raw = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(raw.gifts.length, 2);
  const svc2 = createService({ orgId: 'org_1', store: createFileStore(file) });
  const avail = await svc2.listAvailable();
  assert.ok(avail.some((p) => p.available === '8.00'));
  const again = deserializeState(raw);
  assert.equal(again.gifts.get('persist-1').netCents, 500n);
});
