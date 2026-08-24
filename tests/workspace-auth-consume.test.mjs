import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  CANONICAL_SUITE_WORKSPACE_URL,
  authConsumeErrorMessage,
  parseAuthRedirect,
  settleAuthFromUrl,
  workspaceAssetBaseHref,
  workspaceRedirectUrl
} from '../workspace/auth-consume.js';

function loc(partial) {
  return {
    origin: partial.origin,
    pathname: partial.pathname,
    hostname: partial.hostname,
    href: partial.href || `${partial.origin}${partial.pathname}`
  };
}

describe('workspaceRedirectUrl prefers an asset-backed consume target', () => {
  test('rewrites the suite /workspace alias to the canonical Portfolio Signals page', () => {
    assert.equal(
      workspaceRedirectUrl(loc({
        origin: 'https://autogive.app',
        hostname: 'autogive.app',
        pathname: '/workspace'
      })),
      CANONICAL_SUITE_WORKSPACE_URL
    );
    assert.equal(
      workspaceRedirectUrl(loc({
        origin: 'https://autogive.app',
        hostname: 'autogive.app',
        pathname: '/workspace.html'
      })),
      CANONICAL_SUITE_WORKSPACE_URL
    );
  });

  test('canonicalizes suite /portfolio-signals/workspace to workspace.html', () => {
    assert.equal(
      workspaceRedirectUrl(loc({
        origin: 'https://autogive.app',
        hostname: 'autogive.app',
        pathname: '/portfolio-signals/workspace'
      })),
      CANONICAL_SUITE_WORKSPACE_URL
    );
  });

  test('keeps Vercel and local workspace.html so relative assets stay on the same origin', () => {
    assert.equal(
      workspaceRedirectUrl(loc({
        origin: 'https://fund-intel-ten.vercel.app',
        hostname: 'fund-intel-ten.vercel.app',
        pathname: '/workspace.html'
      })),
      'https://fund-intel-ten.vercel.app/workspace.html'
    );
    assert.equal(
      workspaceRedirectUrl(loc({
        origin: 'http://127.0.0.1:8080',
        hostname: '127.0.0.1',
        pathname: '/workspace.html'
      })),
      'http://127.0.0.1:8080/workspace.html'
    );
  });

  test('maps a bare Vercel /workspace path to workspace.html', () => {
    assert.equal(
      workspaceRedirectUrl(loc({
        origin: 'https://fund-intel-ten.vercel.app',
        hostname: 'fund-intel-ten.vercel.app',
        pathname: '/workspace'
      })),
      'https://fund-intel-ten.vercel.app/workspace.html'
    );
  });
});

describe('workspaceAssetBaseHref', () => {
  test('treats /workspace the same as /portfolio-signals/ so suite-host scripts resolve', () => {
    assert.equal(workspaceAssetBaseHref('/portfolio-signals'), '/portfolio-signals/');
    assert.equal(workspaceAssetBaseHref('/portfolio-signals/workspace'), '/portfolio-signals/');
    assert.equal(workspaceAssetBaseHref('/workspace'), '/portfolio-signals/');
    assert.equal(workspaceAssetBaseHref('/workspace/'), '/portfolio-signals/');
  });

  test('leaves Vercel and local /workspace.html on the site root', () => {
    assert.equal(workspaceAssetBaseHref('/workspace.html'), '/');
    assert.equal(workspaceAssetBaseHref('/'), '/');
  });

  test('workspace.html inline script includes the /workspace suite alias', () => {
    const html = readFileSync(new URL('../workspace.html', import.meta.url), 'utf8');
    assert.match(html, /path === ["']\/workspace["']/);
    assert.match(html, /baseHref = ["']\/portfolio-signals\/["']/);
  });
});

describe('parseAuthRedirect', () => {
  test('reads implicit hash tokens', () => {
    const parsed = parseAuthRedirect(
      'https://autogive.app/portfolio-signals/workspace.html#access_token=tok&refresh_token=ref&type=magiclink'
    );
    assert.equal(parsed.accessToken, 'tok');
    assert.equal(parsed.refreshToken, 'ref');
    assert.equal(parsed.otpType, 'magiclink');
    assert.equal(parsed.hasAuthPayload, true);
  });

  test('reads token_hash query links without a PKCE code', () => {
    const parsed = parseAuthRedirect(
      'https://autogive.app/portfolio-signals/workspace.html?token_hash=abc&type=magiclink'
    );
    assert.equal(parsed.tokenHash, 'abc');
    assert.equal(parsed.otpType, 'magiclink');
    assert.equal(parsed.code, null);
    assert.equal(parsed.hasAuthPayload, true);
  });

  test('treats a missing payload as a recovered-session candidate, not a failed consume', () => {
    const parsed = parseAuthRedirect('https://autogive.app/portfolio-signals/workspace.html');
    assert.equal(parsed.hasAuthPayload, false);
    assert.equal(parsed.accessToken, null);
    assert.equal(parsed.tokenHash, null);
    assert.equal(parsed.code, null);
  });
});

function mockClient({ session = { access_token: 'sess' }, fail = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      async setSession(tokens) {
        calls.push({ method: 'setSession', tokens });
        if (fail === 'setSession') return { data: { session: null }, error: { message: 'Invalid Refresh Token' } };
        return { data: { session }, error: null };
      },
      async verifyOtp(payload) {
        calls.push({ method: 'verifyOtp', payload });
        if (fail === 'expired') return { data: { session: null }, error: { message: 'Token has expired or is invalid', code: 'otp_expired' } };
        if (fail === 'verifyOtp') return { data: { session: null }, error: { message: 'otp_expired' } };
        return { data: { session }, error: null };
      },
      async exchangeCodeForSession(code) {
        calls.push({ method: 'exchangeCodeForSession', code });
        if (fail === 'pkce') {
          return {
            data: { session: null },
            error: { message: 'both auth code and code verifier should be non-empty' }
          };
        }
        return { data: { session }, error: null };
      },
      async getSession() {
        calls.push({ method: 'getSession' });
        return { data: { session: null }, error: null };
      }
    }
  };
}

describe('settleAuthFromUrl', () => {
  test('consumes implicit hash tokens with setSession and does not request another link', async () => {
    const client = mockClient();
    const messages = [];
    const session = await settleAuthFromUrl(client, {
      href: 'https://autogive.app/portfolio-signals/workspace.html#access_token=tok&refresh_token=ref&type=magiclink',
      onMessage: (text) => messages.push(text),
      onCleanUrl: () => messages.push('cleaned')
    });
    assert.equal(session.access_token, 'sess');
    assert.deepEqual(client.calls[0], {
      method: 'setSession',
      tokens: { access_token: 'tok', refresh_token: 'ref' }
    });
    assert.equal(client.calls.some((call) => call.method === 'exchangeCodeForSession'), false);
    assert.equal(messages.includes('cleaned'), true);
    assert.equal(messages.some((text) => /request a new link/i.test(text)), false);
  });

  test('consumes token_hash with verifyOtp and does not require a PKCE verifier', async () => {
    const client = mockClient();
    const session = await settleAuthFromUrl(client, {
      href: 'https://autogive.app/workspace?token_hash=hashed&type=magiclink',
      onMessage() {},
      onCleanUrl() {}
    });
    assert.equal(session.access_token, 'sess');
    assert.deepEqual(client.calls[0], {
      method: 'verifyOtp',
      payload: { token_hash: 'hashed', type: 'magiclink' }
    });
    assert.equal(client.calls.some((call) => call.method === 'exchangeCodeForSession'), false);
  });

  test('defaults token_hash type to magiclink when the query omits type', async () => {
    const client = mockClient();
    await settleAuthFromUrl(client, {
      href: 'https://autogive.app/portfolio-signals/workspace.html?token_hash=hashed',
      onMessage() {},
      onCleanUrl() {}
    });
    assert.equal(client.calls[0].payload.type, 'magiclink');
  });

  test('missing payload recovers an existing session instead of showing a consume failure', async () => {
    const client = mockClient();
    const messages = [];
    const session = await settleAuthFromUrl(client, {
      href: 'https://autogive.app/portfolio-signals/workspace.html',
      onMessage: (text) => messages.push(text),
      onCleanUrl: () => messages.push('cleaned')
    });
    assert.equal(session, null);
    assert.equal(client.calls.some((call) => call.method === 'getSession'), true);
    assert.equal(client.calls.some((call) => call.method === 'setSession'), false);
    assert.equal(client.calls.some((call) => call.method === 'verifyOtp'), false);
    assert.equal(messages.some((text) => /sign-in link failed|request a new link/i.test(text)), false);
  });

  test('used or expired tokens explain the failure instead of looking like a cold login', async () => {
    const client = mockClient({ fail: 'expired' });
    const messages = [];
    const session = await settleAuthFromUrl(client, {
      href: 'https://autogive.app/portfolio-signals/workspace.html?token_hash=used&type=magiclink',
      onMessage: (text) => messages.push(text),
      onCleanUrl() {}
    });
    assert.equal(session, null);
    assert.match(messages.at(-1), /already used or has expired/i);
    assert.doesNotMatch(messages.at(-1) || '', /send secure sign-in link/i);
  });
});

describe('authConsumeErrorMessage', () => {
  test('maps expired and used OTP errors to an explicit reuse message', () => {
    assert.match(
      authConsumeErrorMessage({ code: 'otp_expired', message: 'Token has expired or is invalid' }),
      /already used or has expired/i
    );
  });

  test('maps missing PKCE verifier to an admin-issued-link explanation', () => {
    assert.match(
      authConsumeErrorMessage({ message: 'both auth code and code verifier should be non-empty' }),
      /cannot be completed in this browser|administrator/i
    );
  });
});

describe('MFA enroll gate copy stays distinct from the send-link form', () => {
  test('workspace shell includes an MFA enroll path that does not reuse the send-link form', () => {
    const html = readFileSync(new URL('../workspace.html', import.meta.url), 'utf8');
    assert.match(html, /id=["']mfaEnroll["']/);
    assert.match(html, /Enforced MFA/i);
    assert.match(html, /id=["']mfaVerifyForm["']/);
    assert.doesNotMatch(
      html.slice(html.indexOf('id="mfaEnroll"'), html.indexOf('id="mfaEnroll"') + 1200),
      /Send secure sign-in link/
    );
  });
});
