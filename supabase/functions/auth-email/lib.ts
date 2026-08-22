// Pure, side-effect-free helpers for the auth-email Edge Function.
// Extracted from index.ts so they can be unit-tested without importing the
// Deno.serve handler (which has runtime side effects).

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DEFAULT_ALLOWED_ORIGIN = 'https://autogive.app';

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
    return url.toString();
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
