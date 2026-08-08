import { test, expect } from '@playwright/test';

/** Narrow phone width without switching browser engine (Pixel/SE-class). */
test.use({
  viewport: { width: 320, height: 568 },
  isMobile: true,
  hasTouch: true,
});

async function assertNoPageOverflow(page) {
  const { scrollW, innerW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  expect(scrollW, `page scrollWidth ${scrollW} > innerWidth ${innerW}`).toBeLessThanOrEqual(innerW + 1);
}

test.describe('mobile layout (320px)', () => {
  test('index has no page-level horizontal overflow', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.site-header')).toBeVisible();
    await assertNoPageOverflow(page);
  });

  test('sponsors public shell has no page-level horizontal overflow', async ({ page }) => {
    await page.goto('/sponsors.html');
    await expect(page.locator('main')).toBeVisible();
    await assertNoPageOverflow(page);
  });

  test('header actions meet minimum tap height', async ({ page }) => {
    await page.goto('/index.html');
    const buttons = page.locator('.header-actions .button, .header-actions button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      if (!box || box.width < 1) continue;
      expect(box.height, `button ${i} height`).toBeGreaterThanOrEqual(40);
    }
  });
});
