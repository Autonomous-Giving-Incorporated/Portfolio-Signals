import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const configs = {
  'hacker-dojo': {
    organization_name: 'Hacker Dojo',
    product_name: 'Campaign Control Center',
    campaign_title: 'Keep the room where builders become possible.',
    campaign_tagline: 'Fund the next builder.',
    modules: { sponsors: true, grants: false },
    theme: { primary: '#C9141C', accent: '#19734A', background: '#071725' },
    assets: { logo_path: null, icon_path: null, hero_path: null }
  },
  'second-tenant': {
    organization_name: 'Second Tenant',
    product_name: 'A.G.I. Campaign Control',
    campaign_title: 'Second tenant independent campaign',
    campaign_tagline: 'An isolated public tenant projection.',
    modules: { sponsors: false, grants: true },
    theme: { primary: '#16325C', accent: '#19734A', background: '#F5F7FB' },
    assets: { logo_path: null, icon_path: null, hero_path: null }
  }
};

async function installTenantApi(page) {
  await page.addInitScript(() => {
    window.AGI_PORTFOLIO_SIGNALS_CONFIG = {
      supabaseUrl: 'https://acceptance.invalid',
      supabaseAnonKey: 'public-test-key',
      defaultClientSlug: 'hacker-dojo'
    };
  });
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm', route => {
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        const configs = ${JSON.stringify(configs)};
        export function createClient() {
          return {
            rpc: async (_name, args) => ({
              data: { config: configs[args.p_slug] },
              error: configs[args.p_slug] ? null : { message: 'not found' }
            })
          };
        }
      `
    });
  });
}

test.beforeEach(async ({ page }) => installTenantApi(page));

test('two tenants retain independent branding, modules, and navigation context', async ({ page }) => {
  await page.goto('/index.html?client=second-tenant');
  await expect(page.locator('.brand-mark')).toHaveAttribute('alt', 'Autonomously Giving Incorporated');
  await expect(page.locator('.brand-product')).toContainText('Portfolio Signals');
  await expect(page.locator('h1').first()).toHaveText('Second tenant independent campaign');
  await expect(page).toHaveTitle('AGI Portfolio Signals · Second Tenant');
  // Public primary-nav module links (pipeline route-cards stay inside gated HD root).
  await expect(page.locator('[data-public-shell] a[href*="grants.html"]')).toBeVisible();
  await expect(page.locator('[data-public-shell] a[href*="sponsors.html"]')).toBeHidden();
  await expect(page.locator('[data-public-shell] a[href*="grants.html"]')).toHaveAttribute(
    'href',
    /client=second-tenant/
  );

  await page.goto('/sponsors.html?client=second-tenant');
  await expect(page.getByText('Module not enabled')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to overview' })).toHaveAttribute(
    'href',
    'index.html?client=second-tenant'
  );

  await page.goto('/index.html?client=hacker-dojo');
  await expect(page.locator('.brand-product')).toContainText('Portfolio Signals');
  await expect(page.locator('h1').first()).toHaveText('Keep the room where builders become possible.');
  await expect(page.locator('[data-public-shell] a[href*="sponsors.html"]')).toBeVisible();
  await expect(page.locator('[data-public-shell] a[href*="grants.html"]')).toBeHidden();
});

for (const path of ['index.html', 'members.html', 'sponsors.html', 'grants.html']) {
  test(`${path} has no serious accessibility violations or horizontal overflow`, async ({ page }) => {
    await page.goto(`/${path}?client=second-tenant`);
    await expect(page.locator('main')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    const results = await new AxeBuilder({ page }).analyze();
    const severe = results.violations.filter(item => ['serious', 'critical'].includes(item.impact));
    expect(severe).toEqual([]);
  });
}
