import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  FIXTURE_PILOT_EMAIL,
  allowFixtureBearer,
  resolveImpactRelayAuthorization
} from '../workspace/impact-relay-auth.js';

describe('Impact Relay Authorization is fail-closed', () => {
  test('missing config does not mint a fixture Bearer', () => {
    const result = resolveImpactRelayAuthorization({});
    assert.equal(result.mode, 'unauthenticated');
    assert.equal(result.authorization, null);
    assert.equal(allowFixtureBearer({}), false);
    assert.equal(allowFixtureBearer(undefined), false);
  });

  test('runtime-config without allowFixtureBearer stays unauthenticated', () => {
    const result = resolveImpactRelayAuthorization({
      allowFixtureBearer: allowFixtureBearer({
        supabaseUrl: 'https://example.supabase.co'
      })
    });
    assert.equal(result.mode, 'unauthenticated');
    assert.equal(result.authorization, null);
  });

  test('explicit local opt-in may send the fixture pilot email', () => {
    const result = resolveImpactRelayAuthorization({ allowFixtureBearer: true });
    assert.equal(result.mode, 'fixture');
    assert.equal(result.authorization, `Bearer ${FIXTURE_PILOT_EMAIL}`);
    assert.equal(allowFixtureBearer({ allowFixtureBearer: true }), true);
  });

  test('a real access token wins over fixture opt-in', () => {
    const result = resolveImpactRelayAuthorization({
      accessToken: ' supabase-jwt ',
      allowFixtureBearer: true
    });
    assert.equal(result.mode, 'bearer');
    assert.equal(result.authorization, 'Bearer supabase-jwt');
  });

  test('bridge source defaults fixtureFallback to false', () => {
    const source = readFileSync(
      new URL('../workspace/impact-relay-bridge.js', import.meta.url),
      'utf8'
    );
    assert.match(source, /fixtureFallback = false/);
  });
});
