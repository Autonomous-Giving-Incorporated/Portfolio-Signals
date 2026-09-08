import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  clientIp,
  createRateLimiter,
  normalizeEmail,
  parseAllowedOrigins,
  pickAllowedOrigin,
  safeRedirect,
  buildWorkspaceConsumeUrl,
  selectAuthEmailActionUrl,
  CANONICAL_SUITE_WORKSPACE,
  DEFAULT_ALLOWED_ORIGIN
} from './lib.ts';

const FALLBACK = CANONICAL_SUITE_WORKSPACE;

test('normalizeEmail lowercases, trims, and rejects malformed input', () => {
  assert.equal(normalizeEmail('  Admin@Example.COM '), 'admin@example.com');
  assert.equal(normalizeEmail('not-an-email'), null);
  assert.equal(normalizeEmail(''), null);
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(`${'a'.repeat(250)}@example.com`), null); // > 254 chars
});

test('parseAllowedOrigins is production-safe by default (no localhost)', () => {
  const def = parseAllowedOrigins(undefined);
  assert.ok(def.has(DEFAULT_ALLOWED_ORIGIN));
  assert.equal(def.has('http://127.0.0.1:8080'), false);
  assert.equal(parseAllowedOrigins('').has('http://127.0.0.1:8080'), false);
});

test('parseAllowedOrigins honors an explicit localhost opt-in for local dev', () => {
  const dev = parseAllowedOrigins('https://autogive.app, http://127.0.0.1:8080');
  assert.ok(dev.has('https://autogive.app'));
  assert.ok(dev.has('http://127.0.0.1:8080'));
});

test('pickAllowedOrigin echoes only allow-listed origins', () => {
  const allowed = parseAllowedOrigins('https://autogive.app');
  assert.equal(pickAllowedOrigin('https://autogive.app', allowed), 'https://autogive.app');
  assert.equal(pickAllowedOrigin('https://evil.example', allowed), 'https://autogive.app');
  assert.equal(pickAllowedOrigin(null, allowed), 'https://autogive.app');
});

test('safeRedirect blocks localhost in production and off-origin redirects', () => {
  const prod = parseAllowedOrigins(undefined);
  assert.equal(safeRedirect('http://127.0.0.1:8080/workspace', prod, FALLBACK), FALLBACK);
  assert.equal(safeRedirect('https://evil.example/workspace', prod, FALLBACK), FALLBACK);
  assert.equal(safeRedirect('https://autogive.app/portfolio-signals/settings', prod, FALLBACK), FALLBACK);
  assert.equal(
    safeRedirect('https://autogive.app/portfolio-signals/workspace.html', prod, FALLBACK),
    'https://autogive.app/portfolio-signals/workspace.html'
  );
  assert.equal(safeRedirect('::not-a-url::', prod, FALLBACK), FALLBACK);
});

test('safeRedirect allows localhost only when explicitly opted in', () => {
  const dev = parseAllowedOrigins('https://autogive.app,http://127.0.0.1:8080');
  assert.equal(
    safeRedirect('http://127.0.0.1:8080/workspace', dev, FALLBACK),
    'http://127.0.0.1:8080/workspace'
  );
  assert.equal(
    safeRedirect('http://127.0.0.1:8080/workspace.html', dev, FALLBACK),
    'http://127.0.0.1:8080/workspace.html'
  );
});

test('safeRedirect rewrites suite /workspace aliases to the asset-backed canonical page', () => {
  const prod = parseAllowedOrigins(undefined);
  assert.equal(safeRedirect('https://autogive.app/workspace', prod, FALLBACK), CANONICAL_SUITE_WORKSPACE);
  assert.equal(
    safeRedirect('https://autogive.app/portfolio-signals/workspace', prod, FALLBACK),
    CANONICAL_SUITE_WORKSPACE
  );
  assert.equal(
    safeRedirect('https://autogive.app/workspace?delegate_invitation=abc', prod, FALLBACK),
    `${CANONICAL_SUITE_WORKSPACE}?delegate_invitation=abc`
  );
});

test('buildWorkspaceConsumeUrl emits a token_hash link settleAuthFromUrl can verify without PKCE', () => {
  const url = buildWorkspaceConsumeUrl(
    'https://autogive.app/portfolio-signals/workspace.html',
    { hashed_token: 'hashed-otp', verification_type: 'magiclink' },
    'magiclink'
  );
  assert.equal(
    url,
    'https://autogive.app/portfolio-signals/workspace.html?token_hash=hashed-otp&type=magiclink'
  );
  assert.doesNotMatch(url || '', /code=|access_token=/);
});

test('buildWorkspaceConsumeUrl preserves invite type and existing query parameters', () => {
  const url = buildWorkspaceConsumeUrl(
    'https://autogive.app/portfolio-signals/workspace.html?delegate_invitation=inv-1',
    { hashed_token: 'invite-hash' },
    'invite'
  );
  const parsed = new URL(url || '');
  assert.equal(parsed.searchParams.get('token_hash'), 'invite-hash');
  assert.equal(parsed.searchParams.get('type'), 'invite');
  assert.equal(parsed.searchParams.get('delegate_invitation'), 'inv-1');
});

test('buildWorkspaceConsumeUrl fails closed when generateLink omits hashed_token', () => {
  assert.equal(
    buildWorkspaceConsumeUrl('https://autogive.app/portfolio-signals/workspace.html', {}, 'magiclink'),
    null
  );
});

test('auth-email emails the consume URL rather than the provider action_link', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.match(source, /selectAuthEmailActionUrl/);
  assert.match(source, /actionUrl: consumeUrl/);
  assert.doesNotMatch(source, /actionUrl: generated\.data\.properties\.action_link/);
  assert.doesNotMatch(source, /action_link \|\| consumeUrl|consumeUrl \|\| .*action_link/);
});

test('selectAuthEmailActionUrl never emails a hashed_token generateLink as the provider verify URL', () => {
  const providerVerify =
    'https://utdioxwiskzatwoejgiu.supabase.co/auth/v1/verify?token=raw-otp&type=magiclink&redirect_to=https://autogive.app/portfolio-signals/workspace.html';
  const url = selectAuthEmailActionUrl(
    'https://autogive.app/portfolio-signals/workspace.html',
    {
      hashed_token: 'hashed-otp',
      verification_type: 'magiclink',
      action_link: providerVerify
    },
    'magiclink'
  );
  assert.equal(
    url,
    'https://autogive.app/portfolio-signals/workspace.html?token_hash=hashed-otp&type=magiclink'
  );
  assert.doesNotMatch(url || '', /auth\/v1\/verify/);
  assert.doesNotMatch(url || '', /token=raw-otp/);
  assert.notEqual(url, providerVerify);
});

test('selectAuthEmailActionUrl fails closed when hashed_token is missing even if action_link exists', () => {
  assert.equal(
    selectAuthEmailActionUrl(
      'https://autogive.app/portfolio-signals/workspace.html',
      {
        action_link:
          'https://utdioxwiskzatwoejgiu.supabase.co/auth/v1/verify?token=raw-otp&type=magiclink'
      },
      'magiclink'
    ),
    null
  );
});

test('clientIp prefers cf-connecting-ip, then first x-forwarded-for, then x-real-ip', () => {
  assert.equal(clientIp(new Headers({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' })), '9.9.9.9');
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })), '1.1.1.1');
  assert.equal(clientIp(new Headers({ 'x-real-ip': '3.3.3.3' })), '3.3.3.3');
  assert.equal(clientIp(new Headers()), 'unknown');
});

test('createRateLimiter enforces max per window, isolates keys, and slides', () => {
  let clock = 1_000_000;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => clock });
  assert.equal(limiter.check('a'), true);
  assert.equal(limiter.check('a'), true);
  assert.equal(limiter.check('a'), false); // third within window blocked
  assert.equal(limiter.check('b'), true); // separate key unaffected
  clock += 1001; // window elapsed
  assert.equal(limiter.check('a'), true); // slot freed
});

// Provenance: auth-email hardening — production-safe origins + coarse self_sign_in throttle
