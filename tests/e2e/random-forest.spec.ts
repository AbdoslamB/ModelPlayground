import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab, view } from './helpers';

const path = 'models/random-forest/';

test('nine trees vote, one row and one small map each', async ({ page }) => {
  await openLab(page, path);
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(9);
  await expect(view(page, 'graph').locator('.thumb')).toHaveCount(9);
  await expect(page.locator('[data-live="vote"]')).toContainText('T = 9 trees');
});

test('more trees: more rows, more maps, and a new tally', async ({ page }) => {
  await openLab(page, path);
  await page.locator('#slider-trees').focus();
  await page.keyboard.press('End');
  await expect(view(page, 'graph').locator('.thumb')).toHaveCount(25);
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(25);
  await expect(page.locator('[data-live="vote"]')).toContainText('T = 25');
  await page.keyboard.press('Home');
  await expect(page.locator('[data-live="vote"]')).toContainText('T = 1 tree');
});

test('picking a tree shows its own sample on the big chart', async ({
  page,
}) => {
  await openLab(page, path);
  const graph = view(page, 'graph');
  await expect(graph.locator('.point--unseen')).toHaveCount(0);
  await view(page, 'table').locator('tbody tr').nth(2).click();
  await expect(graph.locator('.thumb[data-selected]')).toHaveAttribute(
    'data-id',
    '3',
  );
  expect(await graph.locator('.point--unseen').count()).toBeGreaterThan(0);
  await expect(graph.locator('.leaf').first()).toBeVisible();
  await expect(page.locator('[data-live="tree"]')).toContainText('Tree 3');
});

test('moving the new seed changes the votes', async ({ page }) => {
  await openLab(page, path);
  const seed = view(page, 'graph').locator('.query');
  const label = await seed.getAttribute('aria-label');
  await seed.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowUp');
  await expect(seed).not.toHaveAttribute('aria-label', label ?? '');
  // Warm and well watered: the forest says it sprouts.
  await expect(page.locator('[data-live="vote"] strong')).toHaveText('sprouts');
});

test('a new forest gives new trees; Reset brings the first back', async ({
  page,
}) => {
  await openLab(page, path);
  const table = view(page, 'table').locator('tbody');
  const before = await table.innerText();
  await page.getByRole('button', { name: 'New Forest' }).click();
  await expect.poll(async () => table.innerText()).not.toBe(before);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect.poll(async () => table.innerText()).toBe(before);
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
    page.getByRole('heading', { name: 'How a forest is grown' }),
  ).toBeVisible();
  await expect(page.locator('.katex').first()).toBeVisible();
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(9);
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
