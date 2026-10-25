import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab, view } from './helpers';

const path = 'models/linear-regression/';

test('the table shows the 10 points of one set', async ({ page }) => {
  await openLab(page, path);
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(10);
  await expect(view(page, 'graph').locator('.point')).toHaveCount(10);
});

test('Refresh Data brings a new plant and starts from a flat line', async ({
  page,
}) => {
  await openLab(page, path);
  const table = view(page, 'table').locator('tbody');
  const b = page.locator('[data-value="b"]');
  const before = await table.innerText();

  await page.locator('#slider-b').focus();
  await page.keyboard.press('PageUp');
  await expect(b).not.toHaveText('0.0');

  await page.getByRole('button', { name: 'Refresh Data' }).click();

  await expect.poll(async () => table.innerText()).not.toBe(before);
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(10);
  await expect(b).toHaveText('0.0');
});

test('the misses and the best line appear when switched on', async ({
  page,
}) => {
  await openLab(page, path);
  const misses = view(page, 'graph').locator('.miss');
  const best = view(page, 'graph').locator('.best');
  await expect(misses).toHaveCount(0);
  await expect(best).toHaveCount(0);

  await page.getByRole('switch', { name: 'Misses' }).click();
  await expect(misses).toHaveCount(10);
  await page.getByRole('switch', { name: 'Best Line' }).click();
  await expect(best).toHaveCount(1);
});

test('moving slider a updates the equation, meter, table and line', async ({
  page,
}) => {
  await openLab(page, path);
  const live = page.locator('[data-live="model"]');
  const meter = page.locator('.metric__value');
  const yhat = view(page, 'table')
    .locator('tbody tr')
    .first()
    .locator('td.sym-line');
  const line = page.locator('.line');
  const before = [
    await live.innerText(),
    await meter.innerText(),
    await yhat.innerText(),
    await line.getAttribute('y1'),
  ];

  await page.locator('#slider-a').focus();
  await page.keyboard.press('PageDown');

  await expect(live).not.toHaveText(before[0] ?? '');
  await expect(meter).not.toHaveText(before[1] ?? '');
  await expect(yhat).not.toHaveText(before[2] ?? '');
  await expect(line).not.toHaveAttribute('y1', before[3] ?? '');
});

test('dragging a handle tilts the line: a and b both change', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'mouse drag on desktop');
  await openLab(page, path);
  const a = page.locator('[data-value="a"]');
  const b = page.locator('[data-value="b"]');
  const [aBefore, bBefore] = [await a.innerText(), await b.innerText()];

  const handle = page.locator('.handle').nth(1).locator('.handle__dot');
  const box = await handle.boundingBox();
  if (!box) throw new Error('handle not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 6 });
  await page.mouse.up();

  await expect(a).not.toHaveText(aBefore);
  await expect(b).not.toHaveText(bBefore);
  expect(Number((await b.innerText()).replace('−', '-'))).toBeGreaterThan(0);
});

test('scrolling never puts the graph on top of the table', async ({ page }) => {
  await openLab(page, path);
  const table = view(page, 'table');
  await table.scrollIntoViewIfNeeded();
  const graphBox = await view(page, 'graph').boundingBox();
  const tableBox = await table.boundingBox();
  expect(graphBox && tableBox).toBeTruthy();
  expect((graphBox?.y ?? 0) + (graphBox?.height ?? 0)).toBeLessThanOrEqual(
    tableBox?.y ?? 0,
  );
});

test('a phone shows the graph, equation and sliders on one screen', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('iphone'), 'phone only');
  // Safari's visible height on a 375 × 667 phone.
  await page.setViewportSize({ width: 375, height: 548 });
  await openLab(page, path);
  await page.locator('.lab__tools').evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
  });
  for (const selector of [
    '[data-view="graph"]',
    '[data-view="equation"]',
    '#slider-a',
    '#slider-b',
  ]) {
    const box = await page.locator(selector).first().boundingBox();
    expect(box, selector).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0), selector).toBeLessThanOrEqual(
      548,
    );
  }
});

test('the graph is at most 680 px wide, and fits a laptop screen with the sliders', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'desktop sizes');
  for (const [width, height] of [
    [1280, 720],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width, height });
    await openLab(page, path);
    const graph = await view(page, 'graph').boundingBox();
    expect(graph?.width ?? 0).toBeLessThanOrEqual(681);
    await page.locator('.lab__tools').evaluate((el) => {
      el.scrollIntoView({ block: 'start' });
    });
    const slider = await page.locator('#slider-b').boundingBox();
    expect((slider?.y ?? 0) + (slider?.height ?? 0)).toBeLessThanOrEqual(
      height,
    );
  }
});

test('small screens keep the tools on one row and the graph large', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'sizes set by hand');
  // [width, height, smallest acceptable plot width, height]
  const screens = [
    [320, 568, 230, 210],
    [375, 667, 285, 265],
    [667, 375, 380, 200],
    [1440, 900, 600, 330],
  ] as const;
  for (const [width, height, minWidth, minHeight] of screens) {
    await page.setViewportSize({ width, height });
    await openLab(page, path);
    const tools = await page.locator('.lab__tools').boundingBox();
    expect(
      tools?.height ?? 999,
      `${width}: tools on one row`,
    ).toBeLessThanOrEqual(48);
    const plot = await view(page, 'graph')
      .locator('clipPath rect')
      .evaluate((rect) => {
        const box = (rect as SVGRectElement).getBBox();
        return { width: box.width, height: box.height };
      });
    expect(plot.width, `${width}: plot width`).toBeGreaterThanOrEqual(minWidth);
    expect(plot.height, `${width}: plot height`).toBeGreaterThanOrEqual(
      minHeight,
    );
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth, `${width}: no sideways scrolling`).toBeLessThanOrEqual(
      width,
    );
  }
});

test('without JavaScript, the explanation, formulas and table are readable', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(path);
  await expect(
    page.getByRole('heading', { name: /Finding the best line/ }),
  ).toBeVisible();
  await expect(page.locator('.katex').first()).toBeVisible();
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(10);
  await context.close();
});

test('the page has no axe violations in either theme', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'one browser is enough');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await openLab(page, path);
    await page.getByRole('switch', { name: 'Misses' }).click();
    await page.getByRole('switch', { name: 'Best Line' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, scheme).toEqual([]);
  }
});
