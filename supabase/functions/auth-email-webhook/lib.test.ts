import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeSvixSignature,
  eventToDeliveryStatus,
  providerMessageId,
  verifyResendWebhook
} from './lib.ts';

// A synthetic whsec_ secret (base64 body). Not a real key.
const SECRET = 'whsec_c2VjcmV0LWtleS1mb3ItdW5pdC10ZXN0cw==';
const ID = 'msg_2b1c';
const TS_SECONDS = 1_787_000_000;
const NOW_MS = TS_SECONDS * 1000;

async function signedHeaders(body: string, overrides: Record<string, string> = {}) {
  const sig = await computeSvixSignature(SECRET, `${ID}.${TS_SECONDS}.${body}`);
  return new Headers({
    'svix-id': ID,
    'svix-timestamp': String(TS_SECONDS),
    'svix-signature': `v1,${sig}`,
    ...overrides
  });
}

test('eventToDeliveryStatus maps delivery events and ignores others', () => {
  assert.equal(eventToDeliveryStatus('email.delivered'), 'delivered');
  assert.equal(eventToDeliveryStatus('email.bounced'), 'bounced');
  assert.equal(eventToDeliveryStatus('email.complained'), 'complained');
  assert.equal(eventToDeliveryStatus('email.delivery_delayed'), 'delayed');
  assert.equal(eventToDeliveryStatus('email.opened'), null);
  assert.equal(eventToDeliveryStatus('contact.created'), null);
});

test('providerMessageId reads email_id or id, else empty', () => {
  assert.equal(providerMessageId({ data: { email_id: 'abc' } }), 'abc');
  assert.equal(providerMessageId({ data: { id: 'def' } }), 'def');
  assert.equal(providerMessageId({ data: {} }), '');
  assert.equal(providerMessageId(null), '');
});

test('verifyResendWebhook accepts a correctly signed payload', async () => {
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } });
  assert.equal(await verifyResendWebhook(SECRET, await signedHeaders(body), body, NOW_MS), true);
});

test('verifyResendWebhook rejects tampered body, bad signature, and missing headers', async () => {
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } });
  const headers = await signedHeaders(body);
  // Tampered body no longer matches the signature.
  assert.equal(await verifyResendWebhook(SECRET, headers, body + ' ', NOW_MS), false);
  // Wrong signature value.
  const bad = new Headers(headers);
  bad.set('svix-signature', 'v1,not-the-real-signature');
  assert.equal(await verifyResendWebhook(SECRET, bad, body, NOW_MS), false);
  // Missing headers.
  assert.equal(await verifyResendWebhook(SECRET, new Headers(), body, NOW_MS), false);
});

test('verifyResendWebhook rejects out-of-tolerance timestamps (replay)', async () => {
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } });
  const headers = await signedHeaders(body);
  // 10 minutes of skew exceeds the 5-minute window.
  assert.equal(await verifyResendWebhook(SECRET, headers, body, NOW_MS + 600_000), false);
});

// Provenance: auth-email hardening — Resend delivery feedback loop
