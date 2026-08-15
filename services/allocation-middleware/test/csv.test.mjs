import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGiftCsv } from '../src/connectors/csv.mjs';
import { createService } from '../src/app/service.mjs';

test('parseGiftCsv reads header rows', () => {
  const rows = parseGiftCsv(
    'chargeId,netAmount,campaignKey,programKey,currency,donatedAt\n' +
      'c-csv-1,50.00,spring,lab,USD,2026-08-01T00:00:00Z\n',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].chargeId, 'c-csv-1');
  assert.equal(rows[0].netAmount, '50.00');
});

test('parseGiftCsv keeps optional connector contact columns without inventing them', () => {
  const rows = parseGiftCsv(
    'chargeId,netAmount,email,donorPrincipal\n' +
      'c-csv-contact,10.00,donor@example.org,donor_1\n',
  );
  assert.equal(rows[0].email, 'donor@example.org');
  assert.equal(rows[0].donorPrincipal, 'donor_1');
  const bare = parseGiftCsv('chargeId,netAmount\nc-csv-bare,10.00\n');
  assert.equal(bare[0].email, '');
  assert.equal(bare[0].donorPrincipal, '');
});

test('importCsv credits pots', async () => {
  const svc = createService({ orgId: 'org_1', idgen: () => 'x' });
  const result = await svc.importCsv(
    'chargeId,netAmount,campaignKey,programKey,currency,donatedAt\n' +
      'c-csv-2,10.00,,,USD,2026-08-01T00:00:00Z\n',
  );
  assert.equal(result.created, 1);
  assert.ok((await svc.listAvailable()).some((p) => p.available === '10.00'));
});
