import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab, view } from './helpers';

const path = 'models/deep-q-network/';

test('the trained network finds a shortest path', async ({ page }) => {
  await openLab(page, path);
  await expect(page.locator('.metric__value')).toHaveText('8 steps');
  await expect(view(page, 'graph').locator('.draw')).toHaveCount(8);
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(8);
  await expect(page.locator('[data-live="batch"]')).toContainText(
    'After step 3000',
  );
});

test('Train starts from scratch, Pause stops it, Step adds one', async ({
  page,
}) => {
  await openLab(page, path);
  await page.getByRole('button', { name: 'Train from the start' }).click();
  const batch = page.locator('[data-live="batch"]');
  await expect(batch).toContainText(/After step [1-9]/);
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await batch.innerText();
  await page.waitForTimeout(200);
  await expect(batch).toHaveText(paused);
  await page.getByRole('button', { name: 'Step' }).click();
  await expect(batch).not.toHaveText(paused);
});

test('with no training, nothing has been learned yet', async ({ page }) => {
  await openLab(page, path);
  await page.locator('#slider-steps').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('[data-live="target"]')).toContainText(
    'Nothing learned yet',
  );
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(0);
});

test('a different ε gives a different training run', async ({ page }) => {
  await openLab(page, path);
  const table = view(page, 'table').locator('tbody');
  const before = await table.innerText();
  await page.locator('#slider-epsilon').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => table.innerText()).not.toBe(before);
});

test('Refresh Data brings another field', async ({ page }) => {
  await openLab(page, path);
  const cats = view(page, 'graph').locator('.block--cat');
  await expect(cats).toHaveCount(1);
  await page.getByRole('button', { name: 'Refresh Data' }).click();
  await expect(cats).toHaveCount(2);
});

test('small screens keep the tools on one row, with no sideways scroll', async ({
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

test('without JavaScript, the explanation, formula and table are readable', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(path);
  await expect(
    page.getByRole('heading', { name: 'A network instead of a table' }),
  ).toBeVisible();
  await expect(page.locator('.katex').first()).toBeVisible();
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(8);
  await context.close();
});

test('the page has no axe violations in either theme', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'one browser is enough');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await openLab(page, path);
    await view(page, 'table').locator('tbody tr').nth(2).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, scheme).toEqual([]);
  }
});
