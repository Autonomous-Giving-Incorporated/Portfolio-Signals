import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const fixture = {
  runtime: 'test',
  fixture: 'portfolio-signals-synthetic-readonly-v1',
  backendOrigin: 'http://127.0.0.1:4173'
};
const widths = [320, 360, 390, 412];

async function openFixture(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.addInitScript((testMode) => {
    window.AGI_PORTFOLIO_SIGNALS_CONFIG = { testMode };
  }, fixture);
  await page.goto('/workspace.html');
  await expect(page.locator('#workspace')).toBeVisible();
}

for (const width of widths) {
  test(`mobile ${width}px keeps content and touch targets usable`, async ({ page }, testInfo) => {
    await openFixture(page, width, 844);
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      widest: document.documentElement.scrollWidth,
      navButtons: [...document.querySelectorAll('#roleNav button')].map(button => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
      actionRight: document.querySelector('.header-actions')?.getBoundingClientRect().right
    }));
    expect(geometry.widest).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.actionRight).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.navButtons.every(box => box.height >= 44 && box.width >= 44)).toBe(true);

    await page.evaluate(() => scrollTo(0, document.querySelector('#roleNav').offsetTop + 100));
    const sticky = await page.evaluate(() => ({
      bannerBottom: document.querySelector('#testModeBanner').getBoundingClientRect().bottom,
      navTop: document.querySelector('#roleNav').getBoundingClientRect().top
    }));
    expect(sticky.navTop).toBeGreaterThanOrEqual(sticky.bannerBottom - 1);

    await page.screenshot({ path: testInfo.outputPath(`workspace-${width}-portrait.png`), fullPage: true });
  });
}

test('mobile landscape, keyboard navigation, and 200% text remain operable', async ({ page }, testInfo) => {
  await openFixture(page, 844, 390);
  const first = page.locator('#roleNav button').first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#roleNav button').nth(1)).toBeFocused();

  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole('tab', { name: 'Client admin', exact: true }).click();
  const controlLayout = await page.locator('.control-grid').evaluateAll(grids => grids.map(grid => {
    const children = [...grid.children].filter(child => {
      const box = child.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      contained: children.every(child => {
        const box = child.getBoundingClientRect();
        const parent = grid.getBoundingClientRect();
        return box.left >= parent.left - 1 && box.right <= parent.right + 1;
      }),
      viewportContained: grid.getBoundingClientRect().right <= document.documentElement.clientWidth + 1
    };
  }));
  const checkboxLayout = await page.locator('.control-grid fieldset').evaluateAll(fieldsets => fieldsets.map(fieldset => {
    const labels = [...fieldset.querySelectorAll(':scope > label')];
    const overlaps = labels.some((first, index) => labels.slice(index + 1).some(second => {
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    }));
    return { overlaps };
  }));
  const noHorizontalOverflow = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  );
  expect(
    noHorizontalOverflow
      && controlLayout.every(grid => grid.columns === 1 && grid.contained && grid.viewportContained)
      && checkboxLayout.every(fieldset => !fieldset.overlaps),
    `control grids must reflow without overlap: ${JSON.stringify({ controlLayout, checkboxLayout })}`
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('workspace-844-landscape-text-200.png'), fullPage: true });
});

test('synthetic workspace including the persistent warning has no serious accessibility violations', async ({ page }) => {
  await openFixture(page, 390, 844);
  const results = await new AxeBuilder({ page }).include('body').analyze();
  expect(results.violations.filter(item => ['serious', 'critical'].includes(item.impact))).toEqual([]);
});
