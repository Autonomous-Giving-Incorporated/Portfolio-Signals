// Pure, side-effect-free helpers for the auth-email Edge Function.
// Extracted from index.ts so they can be unit-tested without importing the
// Deno.serve handler (which has runtime side effects).

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DEFAULT_ALLOWED_ORIGIN = 'https://autogive.app';

/** Suite path whose workspace.js and CSS actually load. */
export const CANONICAL_SUITE_WORKSPACE = 'https://autogive.app/portfolio-signals/workspace.html';

const SUITE_WORKSPACE_ALIASES = new Set([
  '/workspace',
  '/workspace/',
  '/workspace.html',
  '/portfolio-signals/workspace',
  '/portfolio-signals/workspace/'
]);

function isSuiteHost(hostname: string): boolean {
  return hostname === 'autogive.app' || hostname.endsWith('.autogive.app');
}

/**
 * Rewrite suite aliases that serve HTML but 404 relative scripts
 * (`/workspace.js`) to the Portfolio Signals workspace page.
 */
export function canonicalizeWorkspaceRedirect(url: URL): string {
  if (isSuiteHost(url.hostname) && SUITE_WORKSPACE_ALIASES.has(url.pathname)) {
    const canonical = new URL(CANONICAL_SUITE_WORKSPACE);
    for (const [key, value] of url.searchParams) {
      if (!canonical.searchParams.has(key)) canonical.searchParams.set(key, value);
    }
    return canonical.toString();
  }
  return url.toString();
}

/**
 * Build a workspace URL that settleAuthFromUrl can consume with verifyOtp.
 * Uses hashed_token from admin generateLink so the recipient does not need
 * a PKCE verifier from the sender's browser. Returns null when the token
 * is missing so the send path can fail closed.
 */
export function buildWorkspaceConsumeUrl(
  redirectTo: string,
  properties: { hashed_token?: string; verification_type?: string } | null | undefined,
  linkType: 'invite' | 'magiclink'
): string | null {
  const tokenHash = properties?.hashed_token;
  if (!tokenHash) return null;
  try {
    const url = new URL(redirectTo);
    url.searchParams.set('token_hash', tokenHash);
    url.searchParams.set(
      'type',
      properties?.verification_type || (linkType === 'invite' ? 'invite' : 'magiclink')
    );
    return url.toString();
  } catch {
    return null;
  }
}

function isProviderVerifyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    if (path.includes('/auth/v1/verify')) return true;
    if (host.endsWith('.supabase.co') && path.includes('/auth/v1/')) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * Choose the URL that auth-email may put in the message.
 * hashed_token consume URLs only. Never the provider action_link / verify URL.
 * Missing hashed_token fails closed even when action_link is present.
 */
export function selectAuthEmailActionUrl(
  redirectTo: string,
  properties: {
    hashed_token?: string;
    verification_type?: string;
    action_link?: string;
  } | null | undefined,
  linkType: 'invite' | 'magiclink'
): string | null {
  const consumeUrl = buildWorkspaceConsumeUrl(redirectTo, properties, linkType);
  if (!consumeUrl || isProviderVerifyUrl(consumeUrl)) return null;
  if (properties?.action_link && consumeUrl === properties.action_link) return null;
  return consumeUrl;
}

/**
 * Parse the comma-separated AUTH_ALLOWED_ORIGINS env into a Set. Defaults to
 * production only (no localhost) so a production deploy that forgets to set the
 * variable never accepts 127.0.0.1 origins or redirects. Local development opts
 * in with AUTH_ALLOWED_ORIGINS='https://autogive.app,http://127.0.0.1:8080'.
 */
export function parseAllowedOrigins(raw: string | null | undefined): Set<string> {
  const list = (raw || DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(list.length ? list : [DEFAULT_ALLOWED_ORIGIN]);
}

/** Echo the request origin only when allow-listed; otherwise the first allowed origin. */
export function pickAllowedOrigin(origin: string | null | undefined, allowed: Set<string>): string {
  const first = allowed.values().next().value as string | undefined;
  return origin && allowed.has(origin) ? origin : first || DEFAULT_ALLOWED_ORIGIN;
}

export function normalizeEmail(value: unknown): string | null {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : null;
}

/** Only permit redirects to an allow-listed origin whose path targets the workspace. */
export function safeRedirect(value: unknown, allowed: Set<string>, fallback: string): string {
  try {
    const url = new URL(String(value || fallback));
    if (!allowed.has(url.origin)) return fallback;
    if (!url.pathname.includes('workspace')) return fallback;
    return canonicalizeWorkspaceRedirect(url);
  } catch {
    return fallback;
  }
}

/** Best-effort client IP for coarse throttling of the unauthenticated path. */
export function clientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = headers.get('x-real-ip');
  return real ? real.trim() : 'unknown';
}

export type RateLimiter = { check(key: string): boolean };

/**
 * In-memory sliding-window limiter. Best-effort within a single isolate; a
 * durable per-identity budget (DB or KV) is a documented follow-up. `now` is
 * injectable for deterministic tests.
 */
export function createRateLimiter(opts: { windowMs: number; max: number; now?: () => number }): RateLimiter {
  const { windowMs, max } = opts;
  const now = opts.now || (() => Date.now());
  const hits = new Map<string, number[]>();
  return {
    check(key: string): boolean {
      const current = now();
      const cutoff = current - windowMs;
      const recent = (hits.get(key) || []).filter((timestamp) => timestamp > cutoff);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(current);
      hits.set(key, recent);
      if (hits.size > 5000) {
        for (const [existingKey, timestamps] of hits) {
          const kept = timestamps.filter((timestamp) => timestamp > cutoff);
          if (kept.length) hits.set(existingKey, kept);
          else hits.delete(existingKey);
        }
      }
      return true;
    }
  };
}
