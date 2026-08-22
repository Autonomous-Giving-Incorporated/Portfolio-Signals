/**
 * Web-crypto helpers shared by Node and the Worker.
 * Never log secrets. Compare is constant-time on equal-length strings.
 */

export function timingSafeEqualString(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  const encoder = new TextEncoder();
  const ba = encoder.encode(a);
  const bb = encoder.encode(b);
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length === bb.length ? 0 : 1;
  for (let i = 0; i < len; i += 1) {
    diff |= (ba[i] || 0) ^ (bb[i] || 0);
  }
  return diff === 0;
}

export async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(message)));
}

export async function hmacSha256Hex(secret, message) {
  const buf = await hmacSha256(secret, message);
  return [...new Uint8Array(buf)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hmacSha256Base64(secret, message) {
  const buf = await hmacSha256(secret, message);
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
