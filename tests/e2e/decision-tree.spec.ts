import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab, view } from './helpers';

const path = 'models/decision-tree/';

test('the tree starts at depth 2, with its leaves in the table', async ({
  page,
}) => {
  await openLab(page, path);
  const graph = view(page, 'graph');
  await expect(graph.locator('.node__leaf--1, .node__leaf--2')).toHaveCount(3);
  await expect(graph.locator('.area')).toHaveCount(3);
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(20);
  await expect(page.locator('.metric__value')).toHaveText('19 of 20');
});

test('a deeper tree has more leaves and gets more of its days right', async ({
  page,
}) => {
  await openLab(page, path);
  await page.locator('#slider-depth').focus();
  await page.keyboard.press('End');
  await expect(page.locator('.metric__value')).toHaveText('20 of 20');
  await expect(page.locator('[data-live="leaves"]')).toContainText('G = 0.00');
  await page.keyboard.press('Home');
  await expect(view(page, 'graph').locator('.area')).toHaveCount(2);
});

test('moving the split by keyboard lowers the gain', async ({ page }) => {
  await openLab(page, path);
  const gain = page.locator('[data-live="gain"] strong');
  await expect(gain).toHaveText('0.20');
  const handle = view(page, 'graph').locator('.handle');
  await handle.focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '31');
  await expect(gain).not.toHaveText('0.20');
  expect(Number(await gain.innerText())).toBeLessThan(0.2);
});

test('dragging the split line moves it', async ({ page }) => {
  await openLab(page, path);
  const handle = view(page, 'graph').locator('.handle');
  const box = await handle.boundingBox();
  if (!box) throw new Error('no handle');
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 120, at.y, { steps: 6 });
  await page.mouse.up();
  await expect(handle).not.toHaveAttribute('aria-valuenow', '19');
});

test('picking a node and a feature changes the question', async ({ page }) => {
  await openLab(page, path);
  await page.getByRole('button', { name: /Best on wind/ }).click();
  await expect(page.locator('[data-live="gain"]')).toContainText('Wind ≤');
  await expect(
    view(page, 'graph').locator('.node__text').first(),
  ).toContainText('km/h');

  // Focus the "no" child with the tree's keyboard.
  await page.mouse.move(0, 0);
  await view(page, 'graph').locator('svg.tree').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-live="gini"]')).toContainText(
    'In focus: Wind',
  );

  await page.getByRole('button', { name: 'Reset Tree' }).click();
  await expect(page.locator('[data-live="gain"]')).toContainText('Temp ≤ 19.0');
});

test('Refresh Data brings new days', async ({ page }) => {
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
    page.getByRole('heading', { name: 'How a tree is grown' }),
  ).toBeVisible();
  await expect(page.locator('.katex').first()).toBeVisible();
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(20);
  await context.close();
});

test('the page has no axe violations in either theme', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'one browser is enough');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await openLab(page, path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, scheme).toEqual([]);
  }
});
