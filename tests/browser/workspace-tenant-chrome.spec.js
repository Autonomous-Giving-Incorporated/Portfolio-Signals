import { test, expect } from '@playwright/test';

function supabaseMock({
  session = {
    access_token: 'sess',
    user: { id: 'user-admin', email: 'zer0state@zer0state.com' }
  }
} = {}) {
  const sessionJson = JSON.stringify(session);
  return `
    export function createClient() {
      const session = ${sessionJson};
      return {
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => ({ error: null }),
          setSession: async () => ({ data: { session }, error: null }),
          verifyOtp: async () => ({ data: { session }, error: null }),
          exchangeCodeForSession: async () => ({
            data: { session: null },
            error: { message: 'both auth code and code verifier should be non-empty' }
          }),
          mfa: {
            listFactors: async () => ({ data: { totp: [] }, error: null }),
            enroll: async () => ({ data: { id: 'factor-1', totp: {} }, error: null }),
            challenge: async () => ({ data: { id: 'challenge-1' }, error: null }),
            verify: async () => ({ data: {}, error: null })
          }
        },
        functions: { invoke: async () => ({ data: { accepted: true }, error: null }) },
        rpc: async () => ({ data: null, error: { message: 'unused' } }),
        from: (table) => {
          if (table === 'clients') {
            return {
              select: () => ({
                order: async () => ({
                  data: [
                    {
                      id: 'org_hacker_dojo',
                      slug: 'hacker-dojo',
                      display_name: 'Hacker Dojo',
                      state: 'active',
                      reference_tenant: true,
                      created_at: '2026-01-01T00:00:00Z'
                    }
                  ],
                  error: null
                })
              })
            };
          }
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null })
                }),
                maybeSingle: async () => ({ data: null, error: null })
              })
            })
          };
        }
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
    window.localStorage.removeItem('agi.activeClientId');
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
    await route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        profile: {
          id: 'user-admin',
          display_name: 'Daniel Meyer',
          active: true,
          mfa_enforced: true,
          role: 'director'
        },
        is_master_admin: true,
        clients: [
          {
            id: 'org_hacker_dojo',
            slug: 'hacker-dojo',
            display_name: 'Hacker Dojo',
            state: 'active'
          }
        ]
      })
    });
  });
});

test('platform admin with no membership sees platform chrome only', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm', route => {
    route.fulfill({
      contentType: 'application/javascript',
      body: supabaseMock()
    });
  });

  await page.goto('/workspace.html?token_hash=fresh&type=magiclink');

  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#identityLine')).toHaveText('Daniel Meyer · platform administration');
  await expect(page.locator('#workspace [data-workspace-eyebrow]')).toHaveText(
    'AGI Portfolio Signals · platform administration'
  );
  await expect(page.locator('#workspace [data-workspace-heading]')).toHaveText('Platform administration');
  await expect(page.locator('#workspace .tenant-chip')).toBeHidden();
  await expect(page.locator('#workspace .workspace-context-strip')).toBeHidden();
  await expect(page.locator('#workspace')).not.toContainText('$420K');
  await expect(page.locator('#workspace')).not.toContainText('$2M');
  await expect(page.locator('#decisionCount')).toHaveText('—');
  await expect(page.locator('#clientContext')).toHaveText('Platform administration · no client selected');
  await expect(page.locator('#provisionClientForm')).toBeVisible();
  await expect(page.locator('#workspaceContent')).not.toContainText('Select Platform admin');
  await expect(page.locator('#provisionClientForm [name="director"]')).toBeVisible();
  await expect(page.locator('#provisionClientForm [name="director"]')).not.toHaveAttribute('required', '');
  await expect(page.locator('#provisionClientForm [name="director"]')).not.toHaveAttribute('pattern', /0-9a-fA-F/);
});
