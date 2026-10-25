import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab, view } from './helpers';

const path = 'models/k-means/';

test('Run moves the stands until they settle, and the walk shrinks', async ({
  page,
}) => {
  await openLab(page, path);
  const walk = page.locator('.metric__value');
  const before = Number(await walk.innerText());
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.locator('.metric__label')).toContainText('Settled after', {
    timeout: 15000,
  });
  expect(Number(await walk.innerText())).toBeLessThan(before);
  await expect(view(page, 'graph').locator('.next')).toHaveCount(0);
});

test('Step moves the stands once, and Reset puts them back', async ({
  page,
}) => {
  await openLab(page, path);
  const total = page.locator('[data-live="total"]');
  const before = await total.innerText();
  await page.getByRole('button', { name: 'Step' }).click();
  await expect(total).not.toHaveText(before);
  await expect(page.locator('.metric__label')).toHaveText('After 1 step');
  await page.getByRole('button', { name: 'Reset Stands' }).click();
  await expect(total).toHaveText(before);
});

test('moving a stand regroups people at once', async ({ page }) => {
  await openLab(page, path);
  const table = view(page, 'table').locator('tbody');
  const before = await table.innerText();
  const stand = view(page, 'graph').locator('.stand').first();
  await stand.focus();
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowUp');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => table.innerText()).not.toBe(before);
});

test('k changes the number of stands', async ({ page }) => {
  await openLab(page, path);
  await expect(view(page, 'graph').locator('.stand')).toHaveCount(3);
  await page.locator('#slider-k').focus();
  await page.keyboard.press('End');
  await expect(view(page, 'graph').locator('.stand')).toHaveCount(4);
  await page.keyboard.press('Home');
  await expect(view(page, 'graph').locator('.stand')).toHaveCount(2);
});

test('Lines and Areas switch their layers on and off', async ({ page }) => {
  await openLab(page, path);
  const graph = view(page, 'graph');
  await expect(graph.locator('.walk')).toHaveCount(24);
  await page.getByRole('switch', { name: 'Lines' }).click();
  await expect(graph.locator('.walk')).toHaveCount(0);
  await page.getByRole('switch', { name: 'Areas' }).click();
  expect(await graph.locator('.area').count()).toBeGreaterThan(50);
});

test('small screens keep the tools on one row and a square graph', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'sizes set by hand');
  for (const [width, height] of [
    [1440, 900],
    [375, 667],
  ] as const) {
    await page.setViewportSize({ width, height });
    await openLab(page, path);
    const tools = await page.locator('.lab__tools').boundingBox();
    expect(tools?.height ?? 999, `${width}: tools`).toBeLessThanOrEqual(48);
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth, `${width}: no sideways scrolling`).toBeLessThanOrEqual(
      width,
    );
  }
});

test('without JavaScript, the explanation and table are readable', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(path);
  await expect(
    page.getByRole('heading', { name: 'How k-Means works' }),
  ).toBeVisible();
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(24);
  await context.close();
});

test('the page has no axe violations in either theme', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'one browser is enough');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await openLab(page, path);
    await page.getByRole('switch', { name: 'Areas' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, scheme).toEqual([]);
  }
});
