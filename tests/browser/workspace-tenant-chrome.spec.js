import { test, expect } from '@playwright/test';

const ADMIN_USER_ID = '11111111-1111-4111-8111-111111111111';

function supabaseMock({
  session = {
    access_token: 'sess',
    user: { id: ADMIN_USER_ID, email: 'zer0state@zer0state.com' }
  }
} = {}) {
  const sessionJson = JSON.stringify(session);
  return `
    export function createClient() {
      const session = ${sessionJson};
      if (!globalThis.__provisionCalls) globalThis.__provisionCalls = [];
      const clients = [
        {
          id: 'org_hacker_dojo',
          slug: 'hacker-dojo',
          display_name: 'Hacker Dojo',
          state: 'active',
          reference_tenant: true,
          created_at: '2026-01-01T00:00:00Z'
        }
      ];
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
        rpc: async (name, args) => {
          if (name === 'provision_client') {
            globalThis.__provisionCalls.push(args);
            clients.push({
              id: args.p_client_id,
              slug: args.p_slug,
              display_name: args.p_display_name,
              state: 'provisioning',
              reference_tenant: false,
              created_at: '2026-08-25T00:00:00Z'
            });
            return { data: { id: args.p_client_id }, error: null };
          }
          return { data: null, error: { message: 'unused' } };
        },
        from: (table) => {
          if (table === 'clients') {
            return {
              select: () => ({
                order: async () => ({ data: [...clients], error: null })
              })
            };
          }
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: (_column, value) => ({
                  maybeSingle: async () => (
                    value === session.user.id
                      ? { data: { id: session.user.id }, error: null }
                      : { data: null, error: null }
                  )
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
          id: ADMIN_USER_ID,
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

test('platform admin provisions a tenant without a director UUID and stays on platform chrome', async ({ page }) => {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm', route => {
    route.fulfill({
      contentType: 'application/javascript',
      body: supabaseMock()
    });
  });

  await page.goto('/workspace.html?token_hash=fresh&type=magiclink');
  await expect(page.locator('#provisionClientForm')).toBeVisible();

  await page.locator('#provisionClientForm [name="clientId"]').fill('org_example_civic');
  await page.locator('#provisionClientForm [name="slug"]').fill('example-civic');
  await page.locator('#provisionClientForm [name="displayName"]').fill('Example Civic');
  await page.locator('#provisionClientForm [name="rationale"]').fill('Provision a new civic tenant');
  await page.getByRole('button', { name: 'Provision client' }).click();

  await expect(page.locator('#workspaceContent')).toContainText('org_example_civic');
  await expect(page.locator('#workspace .tenant-chip')).toBeHidden();
  await expect(page.locator('#identityLine')).toHaveText('Daniel Meyer · platform administration');
  await expect(page.locator('#clientContext')).toHaveText('Platform administration · no client selected');

  const calls = await page.evaluate(() => globalThis.__provisionCalls);
  expect(calls).toEqual([
    {
      p_client_id: 'org_example_civic',
      p_slug: 'example-civic',
      p_display_name: 'Example Civic',
      p_initial_director: ADMIN_USER_ID,
      p_rationale: 'Provision a new civic tenant'
    }
  ]);
});
