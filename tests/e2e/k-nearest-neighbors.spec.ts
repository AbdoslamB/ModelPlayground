import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab, plotBox, view } from './helpers';

const path = 'models/k-nearest-neighbors/';

test('the table lists 14 fruits, nearest first, with k of them voting', async ({
  page,
}) => {
  await openLab(page, path);
  const rows = view(page, 'table').locator('tbody tr');
  await expect(rows).toHaveCount(14);
  await expect(
    rows.locator('xpath=self::*[contains(@class,"is-active")]'),
  ).toHaveCount(3);
  const distances = await view(page, 'table')
    .locator('tbody td.sym-line')
    .allInnerTexts();
  const numbers = distances.map(Number);
  expect([...numbers].sort((p, q) => p - q)).toEqual(numbers);
});

test('changing k changes the vote, the voters and the circle', async ({
  page,
}) => {
  await openLab(page, path);
  const vote = page.locator('[data-live="vote"]');
  const reach = view(page, 'graph').locator('.reach');
  const before = [await vote.innerText(), await reach.getAttribute('r')];

  await page.locator('#slider-k').focus();
  await page.keyboard.press('End');

  await expect(vote).toContainText('k = 9 nearest');
  await expect(vote).not.toHaveText(before[0] ?? '');
  await expect(reach).not.toHaveAttribute('r', before[1] ?? '');
  await expect(view(page, 'graph').locator('.link')).toHaveCount(9);
});

test('tapping the graph moves the new fruit and updates everything', async ({
  page,
}) => {
  await openLab(page, path);
  const distance = page.locator('[data-live="distance"]');
  const firstRow = view(page, 'table').locator('tbody tr').first();
  const before = [await distance.innerText(), await firstRow.innerText()];

  // Tap near the top-left: tall, narrow fruits are pears.
  const plot = await plotBox(page);
  await page.mouse.click(
    plot.x + plot.width * 0.15,
    plot.y + plot.height * 0.15,
  );

  await expect(distance).not.toHaveText(before[0] ?? '');
  await expect.poll(async () => firstRow.innerText()).not.toBe(before[1] ?? '');
  await expect(page.locator('[data-live="vote"] strong')).toHaveText('pear');
  await expect(view(page, 'graph').locator('.query__mark--2')).toHaveCount(1);
});

test('the new fruit moves with the arrow keys', async ({ page }) => {
  await openLab(page, path);
  const fruit = view(page, 'graph').locator('.query');
  const label = await fruit.getAttribute('aria-label');
  await fruit.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(fruit).not.toHaveAttribute('aria-label', label ?? '');
});

test('Areas shades the chart, and Refresh Data brings new fruits', async ({
  page,
}) => {
  await openLab(page, path);
  const areas = view(page, 'graph').locator('.area');
  await expect(areas).toHaveCount(0);
  await page.getByRole('switch', { name: 'Areas' }).click();
  expect(await areas.count()).toBeGreaterThan(56);

  const table = view(page, 'table').locator('tbody');
  const before = await table.innerText();
  await page.getByRole('button', { name: 'Refresh Data' }).click();
  await expect.poll(async () => table.innerText()).not.toBe(before);
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(14);
});

test('the graph is square, so a centimetre is as long across as up', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'sizes set by hand');
  for (const [width, height] of [
    [1440, 900],
    [375, 667],
  ] as const) {
    await page.setViewportSize({ width, height });
    await openLab(page, path);
    const plot = await view(page, 'graph')
      .locator('clipPath rect')
      .evaluate((rect) => {
        const box = (rect as SVGRectElement).getBBox();
        return { width: box.width, height: box.height };
      });
    expect(Math.abs(plot.width - plot.height), `${width}`).toBeLessThan(1);
    const tools = await page.locator('.lab__tools').boundingBox();
    expect(
      tools?.height ?? 999,
      `${width}: tools on one row`,
    ).toBeLessThanOrEqual(48);
  }
});

test('without JavaScript, the explanation, formula and table are readable', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Choosing k' })).toBeVisible();
  await expect(page.locator('.katex').first()).toBeVisible();
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(14);
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
