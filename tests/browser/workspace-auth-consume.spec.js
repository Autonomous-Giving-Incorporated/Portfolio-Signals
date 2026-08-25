import { test, expect } from '@playwright/test';

function chainableFrom() {
  return `{
    select() { return this; },
    eq() { return this; },
    in() { return this; },
    is() { return this; },
    maybeSingle: async () => ({ data: null, error: null }),
    then(resolve) { resolve({ data: [], count: 0, error: null }); }
  }`;
}

function supabaseMock({
  verifyError = null,
  session = { access_token: 'sess', user: { id: 'user-1', email: 'director@example.invalid' } },
  contextError = 'Enforced MFA is required for privileged roles.',
  factors = []
} = {}) {
  const verifyErrorJson = verifyError ? JSON.stringify(verifyError) : 'null';
  const sessionJson = JSON.stringify(session);
  const contextErrorJson = JSON.stringify(contextError);
  const factorsJson = JSON.stringify(factors);
  return `
    export function createClient() {
      const session = ${sessionJson};
      return {
        auth: {
          getSession: async () => ({
            data: { session: window.__PS_MFA_VERIFIED ? session : null },
            error: null
          }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null }),
          setSession: async () => ({ data: { session }, error: null }),
          verifyOtp: async () => ({ data: { session }, error: ${verifyErrorJson} }),
          exchangeCodeForSession: async () => ({
            data: { session: null },
            error: { message: 'both auth code and code verifier should be non-empty' }
          }),
          mfa: {
            listFactors: async () => ({ data: { totp: ${factorsJson} }, error: null }),
            enroll: async () => ({
              data: { id: 'factor-1', totp: { qr_code: 'data:image/png;base64,qq', secret: 'SECRET' } },
              error: null
            }),
            challenge: async () => ({ data: { id: 'challenge-1' }, error: null }),
            verify: async () => {
              window.__PS_MFA_VERIFIED = true;
              return { data: session, error: null };
            }
          }
        },
        functions: { invoke: async () => ({ data: { accepted: true }, error: null }) },
        rpc: async (name) => {
          if (name === 'set_mfa_enforced') {
            window.__PS_MFA_ENFORCED = true;
            return { data: { id: 'user-1', mfa_enforced: true, active: true }, error: null };
          }
          return { data: null, error: { message: ${contextErrorJson} } };
        },
        from: () => (${chainableFrom()})
      };
    }
  `;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.AGI_PORTFOLIO_SIGNALS_CONFIG = {
      supabaseUrl: 'https://acceptance.invalid',
      supabaseAnonKey: 'public-test-key'
    };
  });
  await page.route('https://acceptance.invalid/rest/v1/rpc/get_workspace_context', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: ''
      });
      return;
    }
    const enforced = await page.evaluate(() => Boolean(window.__PS_MFA_ENFORCED)).catch(() => false);
    await route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        profile: {
          id: 'user-1',
          display_name: 'Director',
          active: true,
          mfa_enforced: enforced,
          role: 'director'
        },
        is_master_admin: false,
        clients: [{ id: 'org_example', display_name: 'Example', role: 'director', state: 'active' }]
      })
    });
  });
});

test('token_hash consume shows MFA enroll instead of the send-link form', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm', route => {
    route.fulfill({
      contentType: 'application/javascript',
      body: supabaseMock()
    });
  });

  await page.goto('/workspace.html?token_hash=fresh&type=magiclink');
  await expect(page.locator('#mfaEnroll')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send secure sign-in link' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Enroll an authenticator' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify authenticator' })).toBeVisible();
});

test('verified authenticator opens the workspace without an operator confirm step', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm', route => {
    route.fulfill({
      contentType: 'application/javascript',
      body: supabaseMock()
    });
  });

  await page.goto('/workspace.html?token_hash=fresh&type=magiclink');
  await expect(page.locator('#mfaEnroll')).toBeVisible();
  await page.getByLabel('Authentication code').fill('123456');
  await page.getByRole('button', { name: 'Verify authenticator' }).click();
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#mfaEnroll')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Send secure sign-in link' })).toBeHidden();
  await expect(page.getByText(/operator must confirm/i)).toHaveCount(0);
  await expect(page.locator('#identityLine')).toContainText('Director');
});

test('expired token_hash explains reuse instead of a cold login', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm', route => {
    route.fulfill({
      contentType: 'application/javascript',
      body: supabaseMock({
        verifyError: { message: 'Token has expired or is invalid', code: 'otp_expired' },
        session: null
      })
    });
  });

  await page.goto('/workspace.html?token_hash=used&type=magiclink');
  await expect(page.getByText(/already used or has expired/i)).toBeVisible();
  await expect(page.locator('#mfaEnroll')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Send secure sign-in link' })).toBeVisible();
});
