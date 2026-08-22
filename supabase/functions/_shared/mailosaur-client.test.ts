import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertBrandedAuthEmail,
  basicAuthHeader,
  createMailosaurClient,
  inboxAddress,
  isMailosaurConfigured,
  redactAuthEmailMessage,
  summarizeAuthEmail
} from './mailosaur-client.ts';

test('inboxAddress builds a Mailosaur recipient and rejects empty parts', () => {
  assert.equal(inboxAddress('qpbqeifu', 'P8-Director'), 'p8-director@qpbqeifu.mailosaur.net');
  assert.throws(() => inboxAddress('', 'p8'), /server_id_required/);
  assert.throws(() => inboxAddress('qpbqeifu', ''), /local_part_required/);
});

test('basicAuthHeader uses the API key as the Basic username and no password', () => {
  const header = basicAuthHeader('test-key');
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString();
  assert.equal(decoded, 'test-key:');
});

test('isMailosaurConfigured requires both key and server id', () => {
  assert.equal(isMailosaurConfigured({ MAILOSAUR_API_KEY: 'k', MAILOSAUR_SERVER_ID: 'qpbqeifu' }), true);
  assert.equal(isMailosaurConfigured({ MAILOSAUR_API_KEY: '', MAILOSAUR_SERVER_ID: 'qpbqeifu' }), false);
  assert.equal(isMailosaurConfigured({ MAILOSAUR_API_KEY: 'k', MAILOSAUR_SERVER_ID: '' }), false);
  assert.equal(isMailosaurConfigured({}), false);
});

test('redactAuthEmailMessage strips tokens and action URLs from stored copies', () => {
  const redacted = redactAuthEmailMessage({
    subject: 'Your Example tenant administrator sign-in link',
    html: '<a href="https://autogive.app/portfolio-signals/workspace?token_hash=secret&type=magiclink">Sign in</a>',
    text: 'Sign in: https://xxx.supabase.co/auth/v1/verify?token=abc&type=magiclink\naccess_token=leak'
  });
  assert.equal(redacted.subject, 'Your Example tenant administrator sign-in link');
  assert.match(redacted.html, /\[redacted-action-url\]/);
  assert.doesNotMatch(redacted.html, /token_hash=secret|token=abc|access_token/);
  assert.doesNotMatch(redacted.text, /token=abc|access_token=leak/);
  assert.match(redacted.text, /\[redacted-action-url\]/);
});

test('summarizeAuthEmail keeps audience cues and never returns the raw action URL', () => {
  const summary = summarizeAuthEmail({
    subject: 'Your A.G.I. platform administrator sign-in link',
    html: '<html>#e6b23c #0e1116 Autonomously Giving Incorporated<a href="https://example.test/verify?token=abc">x</a></html>',
    text: 'Sign in: https://example.test/verify?token=abc'
  });
  assert.equal(summary.audienceHint, 'platform_admin');
  assert.equal(summary.hasGoldAccent, true);
  assert.equal(summary.hasCarbonAction, true);
  assert.equal(summary.hasLegacyPalette, false);
  assert.equal(summary.actionUrlPresent, true);
  assert.doesNotMatch(JSON.stringify(summary), /token=abc|example\.test\/verify/);
});

test('assertBrandedAuthEmail accepts AGI chrome and rejects the legacy palette', () => {
  const good = {
    subject: 'Your Example Portfolio Signals sign-in link',
    html: '<div style="border-top:4px solid #e6b23c"></div><td bgcolor="#0e1116">Autonomously Giving Incorporated</td>',
    text: 'Sign in: [redacted-action-url]'
  };
  assert.doesNotThrow(() => assertBrandedAuthEmail(good));
  assert.throws(
    () => assertBrandedAuthEmail({
      subject: 'Your Example Portfolio Signals sign-in link',
      html: '<div style="background:#123f36"></div>',
      text: 'ok'
    }),
    /legacy palette/
  );
});

test('createMailosaurClient listServers and waitForMessage use the documented REST paths', async () => {
  const calls: Array<{ url: string; method: string; body: string | null }> = [];
  let searches = 0;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? init.body : null;
    calls.push({ url: String(url), method: String(init?.method || 'GET'), body });
    if (String(url).endsWith('/api/servers')) {
      return new Response(JSON.stringify({ items: [{ id: 'qpbqeifu', name: 'Autogive Tests' }] }), { status: 200 });
    }
    if (String(url).includes('/api/messages/search')) {
      searches += 1;
      if (searches === 1) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        items: [{ id: 'm1', subject: 'Your A.G.I. platform administrator sign-in link' }]
      }), { status: 200 });
    }
    if (String(url).endsWith('/api/messages/m1')) {
      return new Response(JSON.stringify({
        id: 'm1',
        subject: 'Your A.G.I. platform administrator sign-in link',
        html: { body: '<p>#e6b23c</p>' },
        text: { body: 'Sign in: https://example.test/verify?token=abc' }
      }), { status: 200 });
    }
    return new Response('missing', { status: 404 });
  };

  const client = createMailosaurClient({
    apiKey: 'test-key',
    serverId: 'qpbqeifu',
    fetchImpl,
    sleep: async () => undefined
  });
  const servers = await client.listServers();
  assert.deepEqual(servers, [{ id: 'qpbqeifu', name: 'Autogive Tests' }]);
  const message = await client.waitForMessage('p8@qpbqeifu.mailosaur.net', { timeoutMs: 50, intervalMs: 1 });
  assert.equal(message.id, 'm1');
  assert.doesNotMatch(message.text, /token=abc/);
  assert.equal(searches, 2);
  assert.ok(calls.some((call) => call.url.endsWith('/api/servers')));
  assert.ok(calls.some((call) => call.url.includes('/api/messages/search?server=qpbqeifu')));
});

test('waitForMessage forwards receivedAfter as a search query parameter', async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(String(url));
    if (String(url).includes('/api/messages/search')) {
      return new Response(JSON.stringify({
        items: [{ id: 'm2', subject: 'Your Example Portfolio Signals sign-in link' }]
      }), { status: 200 });
    }
    if (String(url).endsWith('/api/messages/m2')) {
      return new Response(JSON.stringify({
        id: 'm2',
        subject: 'Your Example Portfolio Signals sign-in link',
        html: { body: '<p>#e6b23c #0e1116</p>' },
        text: { body: 'ok' }
      }), { status: 200 });
    }
    return new Response('missing', { status: 404 });
  };
  const client = createMailosaurClient({
    apiKey: 'test-key',
    serverId: 'qpbqeifu',
    fetchImpl,
    sleep: async () => undefined
  });
  await client.waitForMessage('p8@qpbqeifu.mailosaur.net', {
    timeoutMs: 10,
    intervalMs: 1,
    receivedAfter: '2026-08-22T04:00:00.000Z'
  });
  assert.ok(calls.some((url) => url.includes('receivedAfter=2026-08-22T04%3A00%3A00.000Z')));
});
