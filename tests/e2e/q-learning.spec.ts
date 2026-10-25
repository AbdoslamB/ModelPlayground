import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab, view } from './helpers';

const path = 'models/q-learning/';

test('the maze, the Q-table and the last update agree', async ({ page }) => {
  await openLab(page, path);
  const squares = await view(page, 'graph').locator('.cell[data-id]').count();
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(squares);
  await expect(page.locator('[data-live="update"]')).toContainText('Q(');
  await expect(view(page, 'table').locator('tbody tr.is-active')).toHaveCount(
    1,
  );
});

test('Step makes one update; more episodes find the shortest path', async ({
  page,
}) => {
  await openLab(page, path);
  const update = page.locator('[data-live="update"]');
  const before = await update.innerText();
  await page.getByRole('button', { name: 'Step' }).click();
  await expect(update).not.toHaveText(before);

  await page.locator('#slider-episodes').focus();
  await page.keyboard.press('End');
  await expect(page.locator('.metric__value')).toHaveText('9 steps');
  await expect(page.locator('.metric__label')).toHaveText(
    'Shortest possible: 9 steps',
  );
});

test('Play moves the mouse, and Pause stops it', async ({ page }) => {
  await openLab(page, path);
  const update = page.locator('[data-live="update"]');
  const before = await update.innerText();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(update).not.toHaveText(before);
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await update.innerText();
  await page.waitForTimeout(300);
  await expect(update).toHaveText(paused);
});

test('clicking a square makes a wall, then a cat, then opens it', async ({
  page,
}) => {
  await openLab(page, path);
  const graph = view(page, 'graph');
  const square = graph.locator('.cell[data-cell="0"]');
  await expect(square).toHaveClass(/cell--open/);
  await square.click();
  await expect(square).toHaveClass(/cell--wall/);
  await square.click();
  await expect(square).toHaveClass(/cell--cat/);
  await square.click();
  await expect(square).toHaveClass(/cell--open/);
});

test('the keyboard moves around the maze and edits squares', async ({
  page,
}) => {
  await openLab(page, path);
  await page.mouse.move(0, 0);
  const maze = view(page, 'graph').locator('svg[role="group"]');
  await maze.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  const table = view(page, 'table');
  await expect(table.locator('tbody tr[data-selected] td').first()).toHaveText(
    'A4',
  );
  const walls = view(page, 'graph').locator('.cell--wall');
  const before = await walls.count();
  await page.keyboard.press('Enter');
  await expect(walls).toHaveCount(before + 1);
});

test('a smaller γ changes what the moves are worth', async ({ page }) => {
  await openLab(page, path);
  const table = view(page, 'table').locator('tbody');
  const before = await table.innerText();
  await page.locator('#slider-gamma').focus();
  await page.keyboard.press('Home');
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
    page.getByRole('heading', { name: 'How the mouse learns' }),
  ).toBeVisible();
  await expect(page.locator('.katex').first()).toBeVisible();
  expect(await view(page, 'table').locator('tbody tr').count()).toBeGreaterThan(
    20,
  );
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
