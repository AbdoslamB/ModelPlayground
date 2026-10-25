import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab, view } from './helpers';

const path = 'models/naive-bayes/';

test('the first message reads as spam, word by word', async ({ page }) => {
  await openLab(page, path);
  const words = view(page, 'table').locator('tbody tr td:first-child');
  await expect(words).toHaveText(['win', 'free', 'lunch', 'today']);
  await expect(view(page, 'graph').locator('.row')).toHaveCount(4);
  await expect(page.locator('[data-live="chance"] strong')).toHaveText('90%');
});

test('typing a message updates the graph, the table and the chance', async ({
  page,
}) => {
  await openLab(page, path);
  await page.locator('#nb-message').fill('see you at lunch tomorrow zebra');
  await expect(view(page, 'graph').locator('.row')).toHaveCount(6);
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(6);
  await expect(view(page, 'table').locator('tbody tr').last()).toContainText(
    'ignored',
  );
  await expect(page.locator('.metric__label')).toHaveText('Likely normal');
});

test('clicking a word switches it off, and again switches it on', async ({
  page,
}) => {
  await openLab(page, path);
  const chance = page.locator('[data-live="chance"] strong');
  const free = view(page, 'graph').locator('.row').nth(1);
  await free.click();
  await expect(free).toHaveClass(/row--off/);
  await expect(view(page, 'table').locator('tbody tr').nth(1)).toContainText(
    'off',
  );
  await expect(chance).not.toHaveText('90%');
  await free.click();
  await expect(chance).toHaveText('90%');
});

test('the words work by keyboard: arrows select, Enter switches', async ({
  page,
}) => {
  await openLab(page, path);
  await page.mouse.move(0, 0);
  await view(page, 'graph').locator('.words').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(view(page, 'graph').locator('.row--off')).toHaveCount(1);
  await expect(page.locator('[data-live="odds"]')).not.toContainText('win');
});

test('more smoothing changes every word chance', async ({ page }) => {
  await openLab(page, path);
  const cells = view(page, 'table').locator('tbody tr td:nth-child(4)');
  const before = await cells.allInnerTexts();
  await page.locator('#slider-alpha').focus();
  await page.keyboard.press('End');
  await expect(page.locator('[data-live="word"]')).toContainText('2.0');
  expect(await cells.allInnerTexts()).not.toEqual(before);
});

test('Next Message brings a new message, and Reset brings it back', async ({
  page,
}) => {
  await openLab(page, path);
  const box = page.locator('#nb-message');
  await page.getByRole('button', { name: 'Next Message' }).click();
  await expect(box).toHaveValue('can you send the prize money now');
  await box.fill('free free free');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(box).toHaveValue('can you send the prize money now');
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
    page.getByRole('heading', { name: 'How the model decides' }),
  ).toBeVisible();
  await expect(page.locator('.katex').first()).toBeVisible();
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(4);
  await context.close();
});

test('the page has no axe violations in either theme', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'one browser is enough');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await openLab(page, path);
    await view(page, 'graph').locator('.row').first().click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, scheme).toEqual([]);
  }
});
