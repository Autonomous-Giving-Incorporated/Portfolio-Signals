import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.AGI_PORTFOLIO_SIGNALS_CONFIG = {
      supabaseUrl: 'https://acceptance.invalid',
      supabaseAnonKey: 'public-test-key'
    };
    window.__authEmailCalls = 0;
  });

  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm', route => {
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        export function createClient() {
          return {
            auth: {
              getSession: async () => ({ data: { session: null }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: async () => ({ error: null })
            },
            functions: {
              invoke: async () => {
                window.__authEmailCalls += 1;
                await new Promise(resolve => setTimeout(resolve, 150));
                return { data: { accepted: true }, error: null };
              }
            }
          };
        }
      `
    });
  });
});

test('sign-in form suppresses duplicate submissions while a request is in flight', async ({ page }) => {
  await page.goto('/workspace.html?client=hacker-dojo');
  await page.getByLabel('Email address').fill('admin@example.invalid');

  await page.locator('#loginForm').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  await expect(page.getByRole('button', { name: 'Send secure sign-in link' })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => window.__authEmailCalls)).toBe(1);
  await expect(page.getByText('If this email is eligible')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send secure sign-in link' })).toBeEnabled();
});

// Provenance: Notion Sprint 001 Hub + Loop 805 Slice 18 + Hash: b67241f265e5a887b205cd60f6dcfa8912847b72
