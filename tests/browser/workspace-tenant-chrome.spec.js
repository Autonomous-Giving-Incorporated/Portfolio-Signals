import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
          if (name === 'request_ir_provisioning') {
            globalThis.__irCalls ||= [];
            globalThis.__irCalls.push(args);
            globalThis.__irRequest = {
              operation_id: '20000000-0000-4000-8000-000000000001',
              client_id: args.p_client_id, tenant_id: args.p_client_id,
              idempotency_key: args.p_idempotency_key, rationale: args.p_rationale,
              state: 'requested', runtime_ready: false
            };
            if (globalThis.__irFailOnce) {
              globalThis.__irFailOnce = false;
              throw new Error('Network response lost');
            }
            return { data: { ...globalThis.__irRequest, replayed: globalThis.__irCalls.length > 1 }, error: null };
          }
          if (name === 'get_ir_provisioning_request') {
            return { data: globalThis.__irRequest || null, error: globalThis.__irStatusError || null };
          }
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

test('IR request persists via SDK and status read without claiming readiness', async ({ page }) => {
  const forbidden = [];
  page.on('request', request => {
    if (request.url().includes('/api/tenant/')) forbidden.push(request.url());
  });
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm', route =>
    route.fulfill({ contentType: 'application/javascript', body: supabaseMock() }));
  await page.goto('/workspace.html?token_hash=fresh&type=magiclink');
  await expect(page.getByRole('button', { name: 'Request IR provisioning' })).toBeVisible();
  await page.getByLabel('Existing client for IR request').selectOption('org_hacker_dojo');
  await page.getByLabel('IR request rationale').fill('Request IR bridge review');
  await page.getByRole('button', { name: 'Request IR provisioning' }).click();
  await expect(page.locator('#irRequestStatus')).toContainText('Request recorded');
  await expect(page.locator('#irRequestStatus')).toContainText('Runtime readiness: not established');
  expect(await page.evaluate(() => globalThis.__irCalls)).toEqual([{
    p_client_id: 'org_hacker_dojo', p_rationale: 'Request IR bridge review',
    p_idempotency_key: expect.stringMatching(/^[0-9a-f-]{36}$/)
  }]);
  await expect(page.locator('#workspaceContent')).not.toContainText('python -c');
  await expect(page.getByRole('button', { name: 'Clone tenant from template' })).toHaveCount(0);
  expect(forbidden).toEqual([]);
  const audit = await new AxeBuilder({ page }).include('#irProvisioningArea')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.locator('#irProvisioningArea').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

async function openIrRequests(page) {
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm', route =>
    route.fulfill({ contentType: 'application/javascript', body: supabaseMock() }));
  await page.goto('/workspace.html?token_hash=fresh&type=magiclink');
  await page.getByLabel('Existing client for IR request').selectOption('org_hacker_dojo');
  await page.getByLabel('IR request rationale').fill('Request IR bridge review');
}

test('IR lost-response retry reuses key and performs readback', async ({ page }) => {
  await openIrRequests(page);
  await page.evaluate(() => { globalThis.__irFailOnce = true; });
  await page.getByRole('button', { name: 'Request IR provisioning' }).click();
  await expect(page.locator('#irRequestStatus')).toContainText('service unavailable or access denied');
  await page.getByRole('button', { name: 'Request IR provisioning' }).click();
  await expect(page.locator('#irRequestStatus')).toContainText('Existing request replayed');
  const calls = await page.evaluate(() => globalThis.__irCalls);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
});

test('IR status unavailable cannot turn a successful write response into readiness', async ({ page }) => {
  await openIrRequests(page);
  await page.evaluate(() => { globalThis.__irStatusError = { message: '<script>private error</script>', code: 'PGRST202' }; });
  await page.getByRole('button', { name: 'Request IR provisioning' }).click();
  await expect(page.locator('#irRequestStatus')).toContainText('service unavailable or access denied');
  await expect(page.locator('#irRequestStatus')).not.toContainText('Request recorded');
  await expect(page.locator('#irRequestStatus')).not.toContainText('private error');
  await expect(page.getByRole('button', { name: 'Request IR provisioning' })).toBeEnabled();
});

test('IR status is read-only, accessible by keyboard, and rejects foreign binding', async ({ page }) => {
  await openIrRequests(page);
  const check = page.getByRole('button', { name: 'Check request status' });
  await check.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#irRequestStatus')).toContainText('No provisioning request recorded');
  expect(await page.evaluate(() => globalThis.__irCalls || [])).toEqual([]);
  await page.evaluate(() => { globalThis.__irRequest = {
    client_id: 'org_foreign', tenant_id: 'org_foreign', operation_id: 'foreign',
    idempotency_key: 'foreign', rationale: 'Request IR bridge review', state: 'requested', runtime_ready: true
  }; });
  await check.click();
  await expect(page.locator('#irRequestStatus')).toContainText('service unavailable or access denied');
  await expect(page.locator('#irRequestStatus')).not.toContainText('foreign');
  await expect(page.locator('#irRequestStatus')).toHaveAttribute('role', 'status');
});

test('IR request explains that recording does not start an executor', async ({ page }) => {
  await openIrRequests(page);
  await expect(page.locator('#irProvisioningArea')).toContainText('After recording a request, explicitly persist an empty scaffold (reservation), then initialize and open a read-only workspace. This does not start runtime operations.');
});

for (const field of ['operation_id', 'idempotency_key']) {
  test(`IR status rejects malformed ${field} rather than reporting progress`, async ({ page }) => {
    await openIrRequests(page);
    await page.evaluate(field => { globalThis.__irRequest = {
      client_id: 'org_hacker_dojo', tenant_id: 'org_hacker_dojo',
      operation_id: '20000000-0000-4000-8000-000000000001',
      idempotency_key: '20000000-0000-4000-8000-000000000002',
      rationale: 'Request IR bridge review', state: 'requested', runtime_ready: false,
      [field]: 'not-a-uuid'
    }; }, field);
    await page.getByRole('button', { name: 'Check request status' }).click();
    await expect(page.locator('#irRequestStatus')).toContainText('service unavailable or access denied');
    await expect(page.locator('#irRequestStatus')).not.toContainText('Existing request found');
  });
}

test('IR request localization uses text and never interprets client names as HTML', async ({ page }) => {
  await openIrRequests(page);
  await page.evaluate(async () => {
    const { mountIrProvisioning } = await import('/workspace/ir-provisioning.js');
    mountIrProvisioning(document.querySelector('#irProvisioningArea'), {
      supabase: { rpc: async () => ({ data: null, error: null }) },
      clients: [{ id: 'org_localized', display_name: '<img src=x onerror=alert(1)>', state: 'provisioning' }],
      messages: { title: 'Solicitudes de IR', choose: 'Seleccione cliente', check: 'Consultar estado' }
    });
  });
  await expect(page.getByRole('heading', { name: 'Solicitudes de IR' })).toBeVisible();
  await expect(page.locator('#irProvisioningArea img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Consultar estado' })).toBeVisible();
});
