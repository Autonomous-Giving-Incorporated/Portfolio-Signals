import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractOptInContact } from '../src/connectors/contact.mjs';

test('extractOptInContact returns null when identity is omitted', () => {
  assert.equal(extractOptInContact({ chargeId: 'c1', amount: '1.00' }), null);
  assert.equal(extractOptInContact({ email: '' }), null);
  assert.equal(extractOptInContact({ email: 'not-an-email' }), null);
  assert.equal(extractOptInContact(null), null);
});

test('extractOptInContact keeps connector-supplied email and donor principal', () => {
  assert.deepEqual(
    extractOptInContact({ email: 'Jane@Example.org', donorId: 'donor_1' }),
    { email: 'jane@example.org', donorPrincipal: 'donor_1' },
  );
  assert.deepEqual(
    extractOptInContact({ fromDonor: { id: 'd2', email: 'a@b.co' } }),
    { email: 'a@b.co', donorPrincipal: 'd2' },
  );
});

test('extractOptInContact does not invent a missing channel', () => {
  assert.deepEqual(extractOptInContact({ firstName: 'Jane' }), null);
  assert.deepEqual(extractOptInContact({ donorId: 'only-principal' }), { donorPrincipal: 'only-principal' });
});
