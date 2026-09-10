import { test, expect } from '@playwright/test';

const fixture = {
  runtime: 'test',
  fixture: 'portfolio-signals-synthetic-readonly-v1',
  backendOrigin: 'http://127.0.0.1:4173'
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((testMode) => {
    window.AGI_PORTFOLIO_SIGNALS_CONFIG = { testMode };
  }, fixture);
});

test('explicit local fixture opens the authenticated workspace without auth residue', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }));

  await page.goto('/workspace.html');
  await expect(page.getByRole('status', { name: 'Test mode' })).toContainText(
    'TEST MODE — synthetic data, no production authority'
  );
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#authGate')).toBeHidden();
  await expect(page.locator('#identityLine')).toContainText('Synthetic');
  await expect(page.locator('#roleNav .workspace-nav-button')).toHaveCount(12);
  await expect(page.locator('#decisionCount')).toHaveText('2');

  const residue = await page.evaluate(() => ({
    cookies: document.cookie,
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage)
  }));
  expect(residue).toEqual({ cookies: '', local: [], session: [] });
  expect(requests.filter(request => request.method === 'POST')).toEqual([]);
  expect(requests.some(request => /autogive\.app|vercel\.app|workers\.dev|supabase\.co/.test(request.url))).toBe(false);
});

test('synthetic mode marks mutation controls as unavailable and keeps reads traceable', async ({ page }) => {
  await page.goto('/workspace.html');
  await page.getByRole('tab', { name: 'Decisions' }).click();
  await expect(page.getByText('Synthetic read-only fixture')).toBeVisible();
  expect(await page.locator('.decision-actions button').evaluateAll(buttons =>
    buttons.every(button => button.disabled && button.getAttribute('aria-disabled') === 'true')
  )).toBe(true);
  await page.getByRole('tab', { name: 'Brand & content' }).click();
  await expect(page.getByRole('button', { name: /publish/i })).toBeDisabled();

  const trace = await page.evaluate(() => window.__AGI_TEST_MODE_TRACE);
  expect(trace.some(entry => entry.kind === 'read' && entry.resource === 'decisions')).toBe(true);
  expect(trace.some(entry => entry.kind === 'mutation')).toBe(false);
});

test('every workspace section loads its expected read boundary or explicit no-authority state', async ({ page }) => {
  await page.goto('/workspace.html');
  const expectedReads = {
    'Platform admin': 'clients',
    'Client admin': 'client_memberships',
    'Brand & content': 'client_assets',
    'Onboarding pack': 'get_onboarding_pack',
    Decisions: 'decisions',
    Sponsors: 'opportunities',
    Grants: 'opportunities',
    Claims: 'claims',
    Audit: 'audit_log'
  };
  for (const [label, resource] of Object.entries(expectedReads)) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    await expect.poll(() => page.evaluate((name) =>
      window.__AGI_TEST_MODE_TRACE.some(entry => entry.kind === 'read' && entry.resource === name), resource
    )).toBe(true);
    await expect(page.locator('#workspaceContent > .note.error')).toHaveCount(0);
  }
  for (const label of ['Imports', 'Impact finance', 'Impact donors']) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    await expect(page.getByText('Synthetic read-only fixture')).toBeVisible();
  }
});

test('drag-and-drop uploads stay blocked without network mutations', async ({ page }) => {
  const posts = [];
  page.on('request', request => {
    if (request.method() === 'POST') posts.push(request.url());
  });
  await page.goto('/workspace.html');
  await page.getByRole('tab', { name: 'Onboarding pack', exact: true }).click();
  const dataTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['fixture'], 'synthetic.txt', { type: 'text/plain' }));
    return transfer;
  });
  await page.locator('#onboardingDropzone').dispatchEvent('drop', { dataTransfer });
  await expect(page.locator('#onboardingPackStatus')).toContainText(/no production authority/i);
  expect(posts).toEqual([]);
});

test('read checks cannot re-enable mutation controls', async ({ page }) => {
  await page.goto('/workspace.html');
  await page.getByRole('tab', { name: 'Platform admin', exact: true }).click();
  await page.locator('[name="irClient"]').selectOption('org_synthetic_fixture');
  await page.getByRole('button', { name: 'Check request status' }).click();
  await expect(page.locator('#irRequestStatus')).toContainText('No provisioning request recorded');
  await expect(page.getByRole('button', { name: 'Request IR provisioning' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Persist empty IR scaffold' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Initialize empty IR workspace' })).toBeDisabled();
});

test('synthetic boot removes auth tokens from the address bar', async ({ page }) => {
  await page.goto('/workspace.html?token_hash=secret&type=magiclink#access_token=secret&refresh_token=secret');
  await expect(page.locator('#workspace')).toBeVisible();
  await expect.poll(() => page.url()).toBe('http://127.0.0.1:4173/workspace.html');
});

test('production browser origin rejects explicit fixture configuration', async ({ page }) => {
  await page.route('https://autogive.app/**', async route => {
    const requested = new URL(route.request().url());
    const response = await page.request.get(`http://127.0.0.1:4173${requested.pathname}${requested.search}`);
    await route.fulfill({ response });
  });

  await page.goto('https://autogive.app/workspace.html');
  await expect(page.locator('#workspace')).toBeHidden();
  await expect(page.locator('#authGate')).toBeVisible();
  await expect(page.getByRole('status', { name: 'Test mode' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.dataset.testMode || null)).toBeNull();
});

test('query parameters alone never bypass authentication', async ({ page }) => {
  await page.addInitScript(() => { window.AGI_PORTFOLIO_SIGNALS_CONFIG = {}; });
  await page.goto('/workspace.html?testMode=1&fixture=portfolio-signals-synthetic-readonly-v1');
  await expect(page.locator('#workspace')).toBeHidden();
  await expect(page.locator('#authGate')).toBeVisible();
  await expect(page.getByText('TEST MODE — synthetic data')).toHaveCount(0);
});
