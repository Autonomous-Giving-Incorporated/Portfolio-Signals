/**
 * Magic-link consume and suite-host redirect helpers.
 * Kept free of the supabase-js CDN import so Node tests can load this module.
 */

export const CANONICAL_SUITE_WORKSPACE_URL = 'https://autogive.app/portfolio-signals/workspace.html';

export const MFA_ENFORCED_REQUIRED = 'mfa_enforced_required';

export const PRIVILEGED_ROLES = new Set([
  'director',
  'campaign_lead',
  'development',
  'data_steward',
  'auditor',
  'infrastructure_delegate'
]);

function isSuiteHost(hostname = '') {
  return hostname === 'autogive.app' || hostname.endsWith('.autogive.app');
}

function isWorkspacePath(pathname = '') {
  return pathname.includes('workspace');
}

/** Asset <base href> for suite aliases. /workspace.html on Vercel stays at /. */
export function workspaceAssetBaseHref(pathname = '') {
  const path = pathname || '';
  if (path === '/portfolio-signals' || path.startsWith('/portfolio-signals/')) {
    return '/portfolio-signals/';
  }
  if (path === '/workspace' || path === '/workspace/' || path.startsWith('/workspace/')) {
    return '/portfolio-signals/';
  }
  if (path === '/impact-relay' || path.startsWith('/impact-relay/')) {
    return '/impact-relay/';
  }
  return '/';
}

/**
 * Return URL that auth-email should use as redirect_to.
 * Prefer a path whose workspace.js actually loads.
 */
export function workspaceRedirectUrl(locationLike = globalThis.location) {
  const origin = locationLike?.origin || '';
  const pathname = locationLike?.pathname || '';
  const hostname = locationLike?.hostname || '';

  if (isSuiteHost(hostname) && isWorkspacePath(pathname)) {
    return CANONICAL_SUITE_WORKSPACE_URL;
  }

  if (pathname === '/workspace' || pathname === '/workspace/') {
    return `${origin}/workspace.html`;
  }

  if (isWorkspacePath(pathname)) {
    return `${origin}${pathname}`;
  }

  const href = locationLike?.href || `${origin}${pathname}`;
  return href.split('#')[0].split('?')[0];
}

export function parseAuthRedirect(href) {
  const url = new URL(href, 'https://autogive.app');
  const hashParams = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const hashError = hashParams.get('error') || hashParams.get('error_code');
  const hashErrorDetail =
    hashParams.get('error_description') ||
    hashParams.get('error_code') ||
    hashParams.get('error') ||
    'sign-in link invalid';
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const otpType = url.searchParams.get('type') || hashParams.get('type');
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  return {
    hashError,
    hashErrorDetail,
    code,
    tokenHash,
    otpType,
    accessToken,
    refreshToken,
    hasAuthPayload: Boolean(code || tokenHash || accessToken || refreshToken)
  };
}

export function authConsumeErrorMessage(error) {
  const raw = String(error?.message || error || '');
  const code = String(error?.code || error?.error_code || '');
  const blob = `${code} ${raw}`;
  if (/otp_expired|otp_disabled|expired|already.?used|token.?has.?been|invalid.?refresh|token has expired or is invalid/i.test(blob)) {
    return 'This sign-in link was already used or has expired. Ask an administrator to send a new link.';
  }
  if (/pkce|code.?verifier|both auth code and code verifier/i.test(blob)) {
    return 'This sign-in link cannot be completed in this browser. Ask an administrator to send a new link.';
  }
  return `Sign-in link failed: ${raw}. Request a new link.`;
}

export function privilegedMfaMissing(profile, context) {
  const role = profile?.role || null;
  return Boolean((PRIVILEGED_ROLES.has(role) || context?.is_master_admin) && !profile?.mfa_enforced);
}

export function isPrivilegedMfaRequiredError(error) {
  return error?.code === MFA_ENFORCED_REQUIRED || /Enforced MFA is required/i.test(String(error?.message || ''));
}

function withTimeout(promise, ms, label) {
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

async function recoverSession(client) {
  if (!client?.auth?.getSession) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

/**
 * Consume auth redirect payloads before session reads.
 * Admin-issued links use ?token_hash=…&type=… so the recipient does not need
 * a PKCE verifier from the sender's browser.
 */
export async function settleAuthFromUrl(client, {
  href = typeof window !== 'undefined' ? window.location.href : '',
  onMessage = () => {},
  onCleanUrl = () => {}
} = {}) {
  const parsed = parseAuthRedirect(href);

  if (parsed.hashError) {
    const detail = decodeURIComponent(String(parsed.hashErrorDetail || 'sign-in link invalid').replace(/\+/g, ' '));
    onMessage(`Sign-in link failed: ${detail}. Request a new link.`);
    onCleanUrl();
    return null;
  }

  if (!parsed.hasAuthPayload) {
    return recoverSession(client);
  }

  onMessage('Completing secure sign-in…');

  try {
    if (parsed.code) {
      const { data, error } = await withTimeout(
        client.auth.exchangeCodeForSession(parsed.code),
        12000,
        'Code exchange'
      );
      if (error) throw error;
      onCleanUrl();
      onMessage('');
      return data.session;
    }

    if (parsed.tokenHash) {
      const { data, error } = await withTimeout(
        client.auth.verifyOtp({
          token_hash: parsed.tokenHash,
          type: parsed.otpType || 'magiclink'
        }),
        12000,
        'OTP verify'
      );
      if (error) throw error;
      onCleanUrl();
      onMessage('');
      return data.session;
    }

    if (parsed.accessToken && parsed.refreshToken) {
      onCleanUrl();
      const { data, error } = await withTimeout(
        client.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken
        }),
        12000,
        'Session establish'
      );
      if (error) throw error;
      onMessage('');
      return data.session;
    }

    onMessage('Sign-in link incomplete. Request a new link.');
    onCleanUrl();
    return null;
  } catch (error) {
    onMessage(authConsumeErrorMessage(error));
    onCleanUrl();
    return null;
  }
}
