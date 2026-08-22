import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { list_campaign_hints, normalize_gift, verify_webhook } from '../src/connectors/adapter.mjs';
import { hmacSha256Hex } from '../src/connectors/crypto.mjs';
import { createService } from '../src/app/service.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../fixtures/spec-026');

async function loadJson(rel) {
  return JSON.parse(await readFile(join(root, rel), 'utf8'));
}

test('normalize_gift maps every.org fundraiser and designation', async () => {
  const payload = await loadJson('every-org/gift-completed.json');
  const result = normalize_gift(payload, { source: 'every.org', orgId: 'org_1' });
  assert.equal(result.kind, 'credit');
  assert.equal(result.gift.chargeId, 'fixture-eo-gift-001');
  assert.equal(result.gift.source, 'every.org');
  assert.equal(result.gift.campaignKey, 'community hardware fund');
  assert.equal(result.gift.programKey, 'laptops');
  assert.equal(result.gift.netCents, 2425n);
});

test('normalize_gift maps Givebutter transaction.succeeded', async () => {
  const payload = await loadJson('givebutter/transaction-succeeded.json');
  const hints = list_campaign_hints(payload, { source: 'givebutter' });
  assert.equal(hints.fundraiserKey, 'ABCDEF');
  const result = normalize_gift(payload, { source: 'givebutter', orgId: 'org_1' });
  assert.equal(result.kind, 'credit');
  assert.equal(result.gift.chargeId, 'fixture-gb-txn-001');
  assert.equal(result.gift.netCents, 25000n);
  assert.equal(result.gift.source, 'givebutter');
  assert.equal(result.gift.contact.email, 'alex@example.org');
});

test('Givebutter omits email unless communication_opt_in', async () => {
  const payload = await loadJson('givebutter/transaction-succeeded-no-opt-in.json');
  const result = normalize_gift(payload, { source: 'givebutter', orgId: 'org_1' });
  assert.equal(result.gift.contact, null);
});

test('Givebutter refund.created is hold without credit', async () => {
  const payload = await loadJson('givebutter/refund-created.json');
  const result = normalize_gift(payload, { source: 'givebutter', orgId: 'org_1' });
  assert.equal(result.kind, 'hold');
  const svc = createService({ orgId: 'org_1' });
  const ingested = await svc.ingestGift(payload, { source: 'givebutter' });
  assert.equal(ingested.created, false);
  assert.equal((await svc.getTrail()).gifts.length, 0);
  const exceptions = await svc.listExceptions();
  assert.equal(exceptions.some((item) => item.code === 'SYNC_FAILURE'), true);
});

test('normalize_gift maps Donorbox donation id and inferred net', async () => {
  const payload = await loadJson('donorbox/donation-created-v2.json');
  const result = normalize_gift(payload, { source: 'donorbox', orgId: 'org_1' });
  assert.equal(result.kind, 'credit');
  assert.equal(result.gift.chargeId, '9001');
  assert.notEqual(result.gift.chargeId, payload.donation.stripe_charge_id);
  assert.equal(result.gift.netCents, 9941n);
  assert.equal(result.gift.grossCents, 10000n);
  assert.equal(result.gift.campaignKey, 'donorbox campaign');
  assert.equal(result.gift.programKey, 'designed cause');
  assert.equal(result.gift.contact.email, 'alex@example.org');
});

test('Donorbox fee-absent net equals amount and ignores stripe_charge_id', async () => {
  const payload = await loadJson('donorbox/donation-created-no-fee.json');
  const result = normalize_gift(payload, { source: 'donorbox', orgId: 'org_1' });
  assert.equal(result.gift.chargeId, '9002');
  assert.notEqual(result.gift.chargeId, 'ch_fixture_ignored');
  assert.equal(result.gift.netCents, 4000n);
  assert.equal(result.gift.contact, null);
});

test('Donorbox chargeback is hold without pot debit', async () => {
  const created = await loadJson('donorbox/donation-created-v2.json');
  const chargeback = await loadJson('donorbox/chargeback-created.json');
  const svc = createService({ orgId: 'org_1' });
  await svc.ingestGift(created, { source: 'donorbox' });
  const credited = (await svc.listAvailable()).find((row) => row.campaignKey === 'donorbox campaign');
  assert.equal(credited.credited, '99.41');
  const held = await svc.ingestGift(chargeback, { source: 'donorbox' });
  assert.equal(held.created, false);
  assert.equal((await svc.listAvailable()).find((row) => row.campaignKey === 'donorbox campaign').credited, '99.41');
  assert.equal((await svc.listExceptions()).some((item) => item.code === 'SYNC_FAILURE'), true);
});

test('duplicate chargeId does not double-credit', async () => {
  const payload = await loadJson('givebutter/transaction-succeeded.json');
  const svc = createService({ orgId: 'org_1' });
  const first = await svc.ingestGift(payload, { source: 'givebutter' });
  const second = await svc.ingestGift(payload, { source: 'givebutter' });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  const pot = (await svc.listAvailable())[0];
  assert.equal(pot.credited, '250.00');
  assert.equal((await svc.getTrail()).gifts.length, 1);
});

test('currency mismatch opens CURRENCY_MISMATCH and does not credit', async () => {
  const svc = createService({ orgId: 'org_1' });
  const result = await svc.ingestGift({
    chargeId: 'fixture-eur-1',
    netAmount: '10.00',
    amount: '10.00',
    currency: 'EUR',
  }, { source: 'every.org' });
  assert.equal(result.created, false);
  assert.equal((await svc.getTrail()).gifts.length, 0);
  assert.equal((await svc.listExceptions()).some((item) => item.code === 'CURRENCY_MISMATCH'), true);
});

test('unmapped fundraiser auto-creates a review-tagged pot', async () => {
  const svc = createService({ orgId: 'org_1' });
  await svc.ingestGift({
    event: 'transaction.succeeded',
    data: {
      id: 'fixture-gb-new-camp',
      campaign_code: 'NEWCAMP',
      donated: 10,
      currency: 'USD',
    },
  }, { source: 'givebutter' });
  const pot = (await svc.listAvailable()).find((row) => row.campaignKey === 'newcamp');
  assert.ok(pot);
  assert.equal(pot.campaignLabel, 'New — review');
  assert.equal((await svc.listExceptions()).some((item) => item.code === 'UNMAPPED_FUNDRAISER'), true);
});

test('verify_webhook fail-closed on Givebutter Signature miss', async () => {
  const denied = await verify_webhook(
    { headers: { Signature: 'nope' } },
    { source: 'givebutter', secrets: { givebutterSecret: 'gb-secret' } },
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 401);
  const allowed = await verify_webhook(
    { headers: { Signature: 'gb-secret' } },
    { source: 'givebutter', secrets: { givebutterSecret: 'gb-secret' } },
  );
  assert.equal(allowed.ok, true);
});

test('verify_webhook fail-closed on Donorbox-Signature miss', async () => {
  const raw = '{"event_name":"donation.created"}';
  const denied = await verify_webhook(
    { headers: { 'Donorbox-Signature': '1,deadbeef' } },
    { source: 'donorbox', secrets: { donorboxSecret: 'db-secret' }, rawBody: raw, now: 1_000_000 },
  );
  assert.equal(denied.ok, false);
  const ts = '1000';
  const sig = await hmacSha256Hex('db-secret', `${ts}.${raw}`);
  const allowed = await verify_webhook(
    { headers: { 'Donorbox-Signature': `${ts},${sig}` } },
    { source: 'donorbox', secrets: { donorboxSecret: 'db-secret' }, rawBody: raw, now: 1_000_000 },
  );
  assert.equal(allowed.ok, true);
});

test('CSV row uses the same normalize_gift + chargeId path', async () => {
  const svc = createService({ orgId: 'org_1', now: () => '2026-08-22T00:00:00Z' });
  const csv = await readFile(join(root, 'csv/valid.txt'), 'utf8');
  const first = await svc.importCsv(csv);
  const replay = await svc.importCsv(csv);
  assert.equal(first.created, 1);
  assert.equal(replay.created, 0);
  const trail = await svc.getTrail();
  assert.equal(trail.gifts[0].source, 'csv');
  assert.equal(trail.gifts[0].chargeId, 'fixture-csv-001');
});

test('CSV missing required column is rejected', async () => {
  const svc = createService({ orgId: 'org_1' });
  const csv = await readFile(join(root, 'csv/missing-net.txt'), 'utf8');
  await assert.rejects(() => svc.importCsv(csv), { message: 'csv missing column: netAmount' });
  assert.equal((await svc.getTrail()).gifts.length, 0);
});

test('tenant source and missing donation_link do not invent a URL', async () => {
  const svc = createService({ orgId: 'org_1' });
  const saved = await svc.setOnboarding({ source: 'givebutter' });
  assert.equal(saved.source, 'givebutter');
  assert.equal(saved.donationLink, null);
  await assert.rejects(() => svc.setOnboarding({ source: 'stripe' }), { message: 'INVALID_CONNECTOR_SOURCE' });
  await assert.rejects(() => svc.setOnboarding({ donationLink: 'http://insecure.example/give' }), {
    message: 'DONATION_LINK_INVALID',
  });
});
