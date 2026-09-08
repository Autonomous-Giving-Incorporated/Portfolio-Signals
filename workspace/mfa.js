/**
 * Privileged MFA enroll/verify helpers.
 * Kept free of the supabase-js CDN import so Node tests can load this module.
 */

export function pickTotpChallengeFactor(listed) {
  const totp = Array.isArray(listed?.totp) ? listed.totp : [];
  const verified = totp.find((factor) => factor?.status === 'verified' && factor?.id);
  if (verified) {
    return { factorId: verified.id, alreadyVerified: true };
  }
  const unverified = totp.find((factor) => factor?.status === 'unverified' && factor?.id);
  if (unverified) {
    return { factorId: unverified.id, alreadyVerified: false };
  }
  return { factorId: null, alreadyVerified: false };
}

export function persistedMfaEnforced(payload) {
  const row = Array.isArray(payload) ? payload[0] : payload;
  return row?.mfa_enforced === true;
}

export function workspaceOpensAfterMfaVerify({ verifySucceeded, persistSucceeded }) {
  return Boolean(verifySucceeded && persistSucceeded);
}

function withDefaultTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Challenge + verify TOTP, then persist the existing profiles.mfa_enforced flag.
 * Enroll without verify must not call this. Persist uses set_mfa_enforced, the
 * same profile flag the operator script writes.
 */
export async function completePrivilegedMfaVerify(client, {
  factorId,
  code,
  withTimeout = withDefaultTimeout,
  timeoutMs = 12000
} = {}) {
  if (!client?.auth?.mfa || !factorId || !code) {
    return { ok: false, reason: 'incomplete' };
  }

  const { data: challenge, error: challengeError } = await withTimeout(
    client.auth.mfa.challenge({ factorId }),
    timeoutMs,
    'MFA challenge'
  );
  if (challengeError) return { ok: false, reason: 'challenge', error: challengeError };

  const { data: verified, error: verifyError } = await withTimeout(
    client.auth.mfa.verify({
      factorId,
      challengeId: challenge?.id,
      code
    }),
    timeoutMs,
    'MFA verify'
  );
  if (verifyError) return { ok: false, reason: 'verify', error: verifyError };

  if (typeof client.rpc !== 'function') {
    return { ok: false, reason: 'persist', error: new Error('mfa_enforced_rpc_unavailable') };
  }

  const persist = await withTimeout(
    client.rpc('set_mfa_enforced'),
    timeoutMs,
    'MFA persist'
  );
  if (persist?.error || !persistedMfaEnforced(persist?.data)) {
    return {
      ok: false,
      reason: 'persist',
      error: persist?.error || new Error('mfa_enforced_not_persisted')
    };
  }

  return {
    ok: workspaceOpensAfterMfaVerify({ verifySucceeded: true, persistSucceeded: true }),
    session: verified,
    profile: Array.isArray(persist.data) ? persist.data[0] : persist.data
  };
}
