import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig, buildEveryOrgWebhookUrl } from '../src/app/config.mjs';

test('dev allows missing tokens', () => {
  const c = loadConfig({ NODE_ENV: 'development' });
  assert.equal(c.ok, true);
  assert.equal(c.orgId, 'org_hacker_dojo');
});

test('production requires guards', () => {
  const c = loadConfig({
    NODE_ENV: 'production',
    ORG_ID: 'org_pilot',
    DATA_FILE: '/data/state.json',
    OPERATOR_TOKEN: 'x'.repeat(16),
    WEBHOOK_TOKEN: 'y'.repeat(16),
    PUBLIC_BASE_URL: 'https://alloc.example.com',
  });
  assert.equal(c.ok, true);
});

test('production accepts supabase instead of operator token', () => {
  const c = loadConfig({
    NODE_ENV: 'production',
    ORG_ID: 'org_hacker_dojo',
    DATA_FILE: '/data/state.json',
    WEBHOOK_TOKEN: 'y'.repeat(16),
    PUBLIC_BASE_URL: 'https://alloc.example.com',
    SUPABASE_URL: 'https://xyz.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  });
  assert.equal(c.ok, true);
  assert.equal(c.hasSupabaseAuth, true);
});

test('production fails without DATA_FILE', () => {
  const c = loadConfig({
    NODE_ENV: 'production',
    ORG_ID: 'org_pilot',
    OPERATOR_TOKEN: 'x'.repeat(16),
    WEBHOOK_TOKEN: 'y'.repeat(16),
    PUBLIC_BASE_URL: 'https://alloc.example.com',
  });
  assert.equal(c.ok, false);
  assert.ok(c.errors.some((e) => e.includes('DATA_FILE')));
});

test('buildEveryOrgWebhookUrl appends token', () => {
  assert.equal(
    buildEveryOrgWebhookUrl('https://alloc.example.com/', 'secret'),
    'https://alloc.example.com/webhooks/every-org?token=secret',
  );
});
