import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authorizeWebhookToken,
  parseWebhookJson,
} from '../src/http/webhook-auth.mjs';

test('authorizeWebhookToken rejects empty configuration', () => {
  assert.deepEqual(authorizeWebhookToken('secret', '', ''), {
    ok: false,
    status: 503,
    error: 'webhook_token_unconfigured',
  });
});

test('authorizeWebhookToken rejects mismatch', () => {
  assert.deepEqual(authorizeWebhookToken('nope', '', 'secret'), {
    ok: false,
    status: 401,
    error: 'UNAUTHORIZED',
  });
});

test('authorizeWebhookToken accepts header or query exact match', () => {
  assert.equal(authorizeWebhookToken('secret', '', 'secret').ok, true);
  assert.equal(authorizeWebhookToken('', 'secret', 'secret').ok, true);
});

test('parseWebhookJson fail-closed on malformed and non-object payloads', () => {
  assert.throws(() => parseWebhookJson('{'), { message: 'malformed_payload' });
  assert.throws(() => parseWebhookJson('[]'), { message: 'malformed_payload' });
  assert.throws(() => parseWebhookJson('null'), { message: 'malformed_payload' });
});

test('parseWebhookJson rejects oversized bodies', () => {
  assert.throws(() => parseWebhookJson('{"a":"bbbbbbbb"}', 8), { message: 'PAYLOAD_TOO_LARGE' });
});

test('parseWebhookJson accepts an object', () => {
  assert.deepEqual(parseWebhookJson('{"chargeId":"x"}'), { chargeId: 'x' });
});
