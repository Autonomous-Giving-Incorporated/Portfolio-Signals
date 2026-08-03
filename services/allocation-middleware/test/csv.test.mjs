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

test('importCsv credits pots', () => {
  const svc = createService({ orgId: 'org_1', idgen: () => 'x' });
  const result = svc.importCsv(
    'chargeId,netAmount,campaignKey,programKey,currency,donatedAt\n' +
      'c-csv-2,10.00,,,USD,2026-08-01T00:00:00Z\n',
  );
  assert.equal(result.created, 1);
  assert.ok(svc.listAvailable().some((p) => p.available === '10.00'));
});
