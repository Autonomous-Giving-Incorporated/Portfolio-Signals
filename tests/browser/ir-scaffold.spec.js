import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { handleWorkerRequest } from '../../workers/portfolio-signals/src/index.js';
const operation = '20000000-0000-4000-8000-000000000001';
test('guided scaffold execution uses Worker and recoverable readback without activation', async ({ page }) => {
  const calls = [];
  let stored = null;
  await page.route('**/api/ir/provisioning/*', async route => {
    const browserRequest = route.request();
    const response = await handleWorkerRequest(new Request(browserRequest.url(), {
      method: browserRequest.method(), headers: browserRequest.headers(),
      ...(browserRequest.postData() ? { body: browserRequest.postData() } : {})
    }), { PLATFORM_SUPABASE_URL: 'https://supabase.test', PLATFORM_SUPABASE_ANON_KEY: 'test-public-key' }, {
      fetchImpl: async (url, init) => {
        calls.push(url.split('/').pop());
        expect(init.headers.authorization).toBe('Bearer browser-human');
        if (url.endsWith('/user')) return Response.json({ id: operation });
        if (url.endsWith('/execute_ir_provisioning')) stored = {
          client_id: 'org_test', tenant_id: 'org_test', operation_id: operation, idempotency_key: operation,
          state: 'scaffold_persisted', runtime_ready: false,
          policy_json: JSON.stringify({ format: 'ir-policy-v1', policy: { tenant_id: 'org_test', version: 'fi-empty-v1' } })
        };
        return Response.json(stored);
      }
    });
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
  });
  await page.goto('/index.html');
  await page.evaluate(async ({ operation }) => {
    const { mountIrProvisioning } = await import('/workspace/ir-provisioning.js');
    document.body.innerHTML = '<main id="test"></main>';
    mountIrProvisioning(document.querySelector('#test'), {
      clients: [{ id: 'org_test', display_name: 'Test tenant', state: 'provisioning' }],
      supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'browser-human' } } }) },
        rpc: async () => ({ data: { client_id: 'org_test', tenant_id: 'org_test', operation_id: operation,
          idempotency_key: operation, rationale: 'Test scaffold request', state: 'requested', runtime_ready: false }, error: null }) }
    });
  }, { operation });
  await page.getByLabel('Existing client for IR request').selectOption('org_test');
  await page.getByRole('button', { name: 'Persist empty IR scaffold' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#irRequestStatus')).toContainText('Empty scaffold persisted');
  await expect(page.locator('#irRequestStatus')).toContainText('Runtime readiness: not established');
  await page.getByRole('button', { name: 'Check scaffold status' }).click();
  await expect(page.locator('#irRequestStatus')).toContainText('Empty scaffold persisted');
  const audit = await new AxeBuilder({ page }).include('#test').withTags(['wcag2a','wcag2aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(calls).toEqual(['user', 'execute_ir_provisioning', 'get_ir_workspace_scaffold', 'user', 'get_ir_workspace_scaffold']);
});
