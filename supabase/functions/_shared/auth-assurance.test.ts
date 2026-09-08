import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jwtAssuranceLevel } from './auth-assurance.ts';

function token(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'ES256' })}.${encode(payload)}.validated-signature`;
}

test('reads aal2 from an already validated access token', () => {
  assert.equal(jwtAssuranceLevel(token({ aal: 'aal2' })), 'aal2');
});

test('preserves lower assurance for fail-closed authorization', () => {
  assert.equal(jwtAssuranceLevel(token({ aal: 'aal1' })), 'aal1');
});

test('rejects malformed or claimless payloads', () => {
  assert.equal(jwtAssuranceLevel('malformed'), null);
  assert.equal(jwtAssuranceLevel(token({ sub: 'user' })), null);
});

// Provenance: Notion Sprint 001 Hub + Loop 805 Slice 19 + Hash: eeb04eebe1d44b81200b52da47edcb4fc3ca0bc5
