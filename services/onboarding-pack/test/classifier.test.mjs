import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/classifier.mjs';
import { REQUIRED_SLOTS, TEMPLATE_VERSION, MAX_BYTES } from '../src/template.mjs';

test('template version and required slots', () => {
  assert.equal(TEMPLATE_VERSION, 'onboarding_pack_v1');
  assert.deepEqual(REQUIRED_SLOTS, [
    'org_legal_name_proof',
    'tax_exempt_or_ein',
    'governance',
    'brand_logo',
    'primary_contact'
  ]);
  assert.equal(MAX_BYTES, 25 * 1024 * 1024);
});

test('xlsx parks as CRM', () => {
  const r = classify({ filename: 'Master Development List.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.equal(r.status, 'parked_crm');
  assert.equal(r.suggested_type, 'parked_crm');
});

test('csv parks as CRM', () => {
  const r = classify({ filename: 'donors.csv', mimeType: 'text/csv' });
  assert.equal(r.status, 'parked_crm');
  assert.equal(r.suggested_type, 'parked_crm');
});

test('bylaws pdf suggests governance', () => {
  const r = classify({ filename: 'Acme-Bylaws-2024.pdf', mimeType: 'application/pdf' });
  assert.equal(r.status, 'stored');
  assert.equal(r.suggested_type, 'governance');
  assert.ok(r.confidence > 0);
});

test('ein letter suggests tax_exempt_or_ein', () => {
  const r = classify({ filename: 'IRS-EIN-letter.pdf', mimeType: 'application/pdf' });
  assert.equal(r.suggested_type, 'tax_exempt_or_ein');
});

test('logo png suggests brand_logo', () => {
  const r = classify({ filename: 'logo.png', mimeType: 'image/png' });
  assert.equal(r.suggested_type, 'brand_logo');
});

test('unknown pdf is uncategorized stored', () => {
  const r = classify({ filename: 'scan-003.pdf', mimeType: 'application/pdf' });
  assert.equal(r.status, 'stored');
  assert.equal(r.suggested_type, 'uncategorized');
});

test('exe is rejected', () => {
  const r = classify({ filename: 'setup.exe', mimeType: 'application/octet-stream' });
  assert.equal(r.status, 'rejected');
  assert.ok(r.reject_reason);
});
