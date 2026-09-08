/**
 * Fail-closed Impact Relay Authorization resolution.
 * No browser or Supabase imports — unit-tested from Node.
 */

export const FIXTURE_PILOT_EMAIL = 'finance.approver@hackersdojo.example';

export function allowFixtureBearer(config = {}) {
  return config.allowFixtureBearer === true;
}

/**
 * Resolve the Authorization header for the Impact Relay console API.
 * Missing runtime-config must not mint a fixture Bearer.
 */
export function resolveImpactRelayAuthorization({
  accessToken,
  allowFixtureBearer: allowFixture = false
} = {}) {
  if (typeof accessToken === 'string' && accessToken.trim()) {
    return {
      mode: 'bearer',
      authorization: `Bearer ${accessToken.trim()}`
    };
  }
  if (allowFixture === true) {
    return {
      mode: 'fixture',
      authorization: `Bearer ${FIXTURE_PILOT_EMAIL}`
    };
  }
  return { mode: 'unauthenticated', authorization: null };
}
