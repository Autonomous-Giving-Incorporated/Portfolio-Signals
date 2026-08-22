/**
 * Shared every.org webhook auth + body guards.
 * Used by the Node pilot server and the Cloudflare Worker port.
 * Token compare is exact-match (header or query). Empty token is unconfigured.
 */

export const DEFAULT_MAX_JSON_BODY_BYTES = 256 * 1024;

export function authorizeWebhookToken(headerToken, queryToken, webhookToken) {
  if (!webhookToken) {
    return { ok: false, status: 503, error: 'webhook_token_unconfigured' };
  }
  const header = headerToken == null ? '' : String(headerToken);
  const query = queryToken == null ? '' : String(queryToken);
  if (header === webhookToken || query === webhookToken) {
    return { ok: true };
  }
  return { ok: false, status: 401, error: 'UNAUTHORIZED' };
}

export function parseWebhookJson(raw, maxBytes = DEFAULT_MAX_JSON_BODY_BYTES, { allowArray = false } = {}) {
  const text = raw == null ? '' : String(raw);
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxBytes) {
    const err = new Error('PAYLOAD_TOO_LARGE');
    err.code = 'PAYLOAD_TOO_LARGE';
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(text || '{}');
  } catch {
    const err = new Error('malformed_payload');
    err.code = 'malformed_payload';
    throw err;
  }
  if (parsed == null || typeof parsed !== 'object') {
    const err = new Error('malformed_payload');
    err.code = 'malformed_payload';
    throw err;
  }
  if (Array.isArray(parsed) && !allowArray) {
    const err = new Error('malformed_payload');
    err.code = 'malformed_payload';
    throw err;
  }
  return parsed;
}

export function jsonHeaders() {
  return {
    'content-type': 'application/json',
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
  };
}
