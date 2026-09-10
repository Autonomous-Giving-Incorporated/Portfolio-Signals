import test from 'node:test';
import assert from 'node:assert/strict';

import { createSyntheticWorkspaceClient, resolveLocalTestMode } from '../workspace/test-mode.js';

const fixture = {
  runtime: 'test',
  fixture: 'portfolio-signals-synthetic-readonly-v1',
  backendOrigin: 'http://127.0.0.1:4173'
};

test('explicit synthetic fixture is accepted only on loopback in test runtime', () => {
  const mode = resolveLocalTestMode({ testMode: fixture }, {
    origin: 'http://127.0.0.1:4173', hostname: '127.0.0.1', protocol: 'http:'
  });
  assert.equal(mode?.fixture, fixture.fixture);
  assert.equal(mode?.authority, 'none');
});

test('test mode fails closed when runtime fixture configuration is missing or malformed', () => {
  const location = { origin: 'http://localhost:4173', hostname: 'localhost', protocol: 'http:' };
  assert.equal(resolveLocalTestMode({}, location), null);
  assert.equal(resolveLocalTestMode({ testMode: { ...fixture, runtime: 'development' } }, location), null);
  assert.equal(resolveLocalTestMode({ testMode: { ...fixture, fixture: 'other' } }, location), null);
  assert.equal(resolveLocalTestMode({ testMode: { ...fixture, backendOrigin: 'https://project.supabase.co' } }, location), null);
});

test('production and non-loopback origins always reject the bypass', () => {
  for (const origin of [
    'https://autogive.app',
    'https://portfolio-signals.vercel.app',
    'https://portfolio-signals.workers.dev',
    'https://project.supabase.co',
    'http://192.168.1.20:4173'
  ]) {
    const url = new URL(origin);
    assert.equal(resolveLocalTestMode({ testMode: fixture }, url), null, origin);
  }
});

test('unknown get-prefixed RPCs fail closed instead of being treated as fixture reads', async () => {
  const mode = resolveLocalTestMode({ testMode: fixture }, new URL('http://127.0.0.1:4173'));
  const client = createSyntheticWorkspaceClient(mode);
  const result = await client.rpc('get_unreviewed_operation');
  assert.equal(result.data, null);
  assert.match(result.error.message, /no production authority/i);
});
