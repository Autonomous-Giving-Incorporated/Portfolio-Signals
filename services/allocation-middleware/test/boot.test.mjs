import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createService } from '../src/app/service.mjs';
import { createMemoryStore } from '../src/app/store.mjs';
import { maybeSeedOnBoot } from '../src/app/boot.mjs';

test('maybeSeedOnBoot skips when flag off', async () => {
  const svc = createService({ orgId: 'org_hacker_dojo', store: createMemoryStore() });
  const r = await maybeSeedOnBoot(svc, { SEED_ON_BOOT: '0' });
  assert.equal(r.skipped, true);
});

test('maybeSeedOnBoot seeds when flag on', async () => {
  const svc = createService({
    orgId: 'org_hacker_dojo',
    store: createMemoryStore(),
    idgen: () => 'boot-alloc',
  });
  const r = await maybeSeedOnBoot(svc, { SEED_ON_BOOT: '1', SEED_ALLOCATE: '1' });
  assert.equal(r.skipped, false);
  assert.ok(r.giftsCreated >= 1);
});
