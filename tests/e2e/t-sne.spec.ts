import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab, view } from './helpers';

const path = 'models/t-sne/';

test('the page opens on a finished map of 40 pictures', async ({ page }) => {
  await openLab(page, path);
  await expect(view(page, 'graph').locator('.picture')).toHaveCount(40);
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(40);
  await expect(page.locator('[data-live="cost"]')).toContainText('t = 1000');
  const kept = Number.parseInt(
    await page.locator('.metric__value').innerText(),
  );
  expect(kept).toBeGreaterThan(60);
});

test('Play starts again from a tiny cloud, and Pause stops it', async ({
  page,
}) => {
  await openLab(page, path);
  await page.getByRole('button', { name: 'Play from the start' }).click();
  const cost = page.locator('[data-live="cost"]');
  await expect(cost).toContainText('pull groups together early');
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await cost.innerText();
  await page.waitForTimeout(200);
  await expect(cost).toHaveText(paused);
  await page.getByRole('button', { name: 'Step' }).click();
  await expect(cost).not.toHaveText(paused);
});

test('a different perplexity draws a different map', async ({ page }) => {
  await openLab(page, path);
  const map = view(page, 'graph').locator('svg').first();
  const before = await map.innerHTML();
  await page.locator('#slider-perplexity').focus();
  await page.keyboard.press('Home');
  await expect.poll(async () => map.innerHTML()).not.toBe(before);
  await expect(page.locator('[data-live="picture"]')).toContainText('u = 2');
});

test('picking a picture shows it larger, with lines to its nearest', async ({
  page,
}) => {
  await openLab(page, path);
  await view(page, 'table').locator('tbody tr').nth(4).click();
  const graph = view(page, 'graph');
  await expect(graph.locator('.tooltip')).toContainText('Picture 5');
  await expect(graph.locator('.link')).toHaveCount(5);
  await expect(page.locator('[data-live="picture"]')).toContainText(
    'Picture 5',
  );
});

test('Refresh Data brings new pictures', async ({ page }) => {
  await openLab(page, path);
  const table = view(page, 'table').locator('tbody');
  const before = await table.innerText();
  await page.getByRole('button', { name: 'Refresh Data' }).click();
  await expect.poll(async () => table.innerText()).not.toBe(before);
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
    page.getByRole('heading', { name: 'How t-SNE draws its map' }),
  ).toBeVisible();
  await expect(page.locator('.katex').first()).toBeVisible();
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(40);
  await context.close();
});

test('the page has no axe violations in either theme', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'one browser is enough');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await openLab(page, path);
    await view(page, 'table').locator('tbody tr').first().click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, scheme).toEqual([]);
  }
});
