// Opt-in real database browser test. Run via FI_IR_BROWSER=1 test-ir-provisioning.py.
// Only /auth/v1/user is a fixture; every RPC uses the disposable signed-JWT PostgREST.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { handleWorkerRequest } from '../../workers/portfolio-signals/src/index.js';
const base = process.env.FI_IR_BROWSER_REST;
const token = process.env.FI_IR_BROWSER_TOKEN;
const operation = process.env.FI_IR_BROWSER_OPERATION;
test('reserved → initialized empty workspace → reload and verified opener; never operational', async ({ page }) => {
  test.skip(!base, 'Requires dedicated disposable PostgREST harness');
  expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  await page.route('**/api/ir/**', async route => {
    const request = route.request();
    const response = await handleWorkerRequest(new Request(request.url(), {
      method: request.method(), headers: request.headers(), ...(request.postData() ? { body: request.postData() } : {})
    }), { PLATFORM_SUPABASE_URL: base, PLATFORM_SUPABASE_ANON_KEY: 'public-test-key' }, {
      fetchImpl: (url, init) => url.endsWith('/auth/v1/user')
        ? Response.json({ id: '00000000-0000-0000-0000-000000000106' }) : fetch(url.replace('/rest/v1/', '/'), init)
    });
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
  });
  async function mount() {
    await page.goto('/index.html');
    await page.evaluate(async ({ token, operation }) => {
      const { mountIrProvisioning } = await import('/workspace/ir-provisioning.js');
      document.body.innerHTML = '<main id="test"></main>';
      mountIrProvisioning(document.querySelector('#test'), {
        clients: [{ id: 'org_ir_http', display_name: 'Synthetic IR browser', state: 'provisioning' }],
        supabase: {
          auth: { getSession: async () => ({ data: { session: { access_token: token } } }) },
          rpc: async () => ({ data: { client_id: 'org_ir_http', tenant_id: 'org_ir_http', operation_id: operation,
            idempotency_key: '00000000-0000-4000-8000-000000000777', rationale: 'Real PostgREST scaffold test', state: 'requested', runtime_ready: false } })
        }
      });
    }, { token, operation });
    await page.getByLabel('Existing client for IR request').selectOption('org_ir_http');
  }
  await mount();
  await page.getByRole('button', { name: 'Check scaffold status' }).click();
  await expect(page.locator('#irRequestStatus')).toContainText('Reserved');
  await page.getByRole('button', { name: 'Initialize empty IR workspace' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#irRequestStatus')).toContainText('Initialized');
  await expect(page.locator('#irRequestStatus')).toContainText('Operational: no');
  await expect(page.locator('#irRequestStatus')).toContainText('ledger commands: 0');
  await page.reload();
  await mount();
  await page.getByRole('button', { name: 'Open initialized IR workspace' }).click();
  await expect(page.locator('#irRequestStatus')).toContainText('Initialized');
  await expect(page.locator('#irRequestStatus')).toContainText('Operational: no');
  const audit = await new AxeBuilder({ page }).include('#test').withTags(['wcag2a','wcag2aa']).analyze();
  expect(audit.violations).toEqual([]);
});
