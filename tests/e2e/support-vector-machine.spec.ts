import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab, view } from './helpers';

const path = 'models/support-vector-machine/';

test('the border, its margin and the support vectors are drawn', async ({
  page,
}) => {
  await openLab(page, path);
  const graph = view(page, 'graph');
  await expect(graph.locator('.border')).toHaveAttribute('d', /^M/);
  await expect(graph.locator('.margin')).toHaveCount(2);
  const rings = await graph.locator('.ring').count();
  await expect(page.locator('.metric__value')).toHaveText(`${rings} of 24`);
  await expect(view(page, 'table').locator('tbody tr.is-active')).toHaveCount(
    rings,
  );
});

test('a larger C narrows the margin', async ({ page }) => {
  await openLab(page, path);
  const margin = page.locator('[data-live="margin"] strong');
  const before = Number.parseFloat(await margin.innerText());
  await page.locator('#slider-c').focus();
  await page.keyboard.press('End');
  await expect(margin).not.toHaveText(`${before.toFixed(2)} h`);
  expect(Number.parseFloat(await margin.innerText())).toBeLessThan(before);
});

test('dragging a support vector moves the border', async ({ page }) => {
  await openLab(page, path);
  const border = view(page, 'graph').locator('.border');
  const before = await border.getAttribute('d');
  // A support vector whose centre is not covered by a neighbour's touch area.
  const ids = await view(page, 'table')
    .locator('tbody tr.is-active')
    .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-row') ?? ''));
  let at: { x: number; y: number } | null = null;
  for (const id of ids) {
    const box = await view(page, 'graph')
      .locator(`.point[data-id="${id}"]`)
      .boundingBox();
    if (!box) continue;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const hit = await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest('[data-id]')
          ?.getAttribute('data-id'),
      centre,
    );
    if (hit === id) {
      at = centre;
      break;
    }
  }
  if (!at) throw new Error('no support vector to grab');
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x - 60, at.y + 40, { steps: 5 });
  await page.mouse.up();
  await expect(border).not.toHaveAttribute('d', before ?? '');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(border).toHaveAttribute('d', before ?? '');
});

test('Shift and the arrow keys move the selected student', async ({ page }) => {
  await openLab(page, path);
  await page.mouse.move(0, 0);
  const table = view(page, 'table');
  await view(page, 'graph').locator('.points').focus();
  await page.keyboard.press('ArrowRight');
  const row = table.locator('tbody tr[data-selected]');
  const before = await row.innerText();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => row.innerText()).not.toBe(before);
});

test('a curved border brings the γ slider and bends', async ({ page }) => {
  await openLab(page, path);
  await expect(page.locator('#slider-gamma')).toHaveCount(0);
  await page.getByRole('switch', { name: 'Curved' }).click();
  await expect(page.locator('#slider-gamma')).toBeVisible();
  await expect(page.locator('[data-live="f"]')).toContainText(
    'support vectors',
  );
  await expect(page.locator('[data-live="margin"]')).toHaveCount(0);
  const border = view(page, 'graph').locator('.border');
  const before = await border.getAttribute('d');
  await page.locator('#slider-gamma').focus();
  await page.keyboard.press('End');
  await expect(border).not.toHaveAttribute('d', before ?? '');
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
    page.getByRole('heading', { name: 'How the model finds its border' }),
  ).toBeVisible();
  await expect(page.locator('.katex').first()).toBeVisible();
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
    await page.getByRole('switch', { name: 'Curved' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, scheme).toEqual([]);
  }
});
