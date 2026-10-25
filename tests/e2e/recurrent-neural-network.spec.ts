import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab, view } from './helpers';

const path = 'models/recurrent-neural-network/';

test('one step per character, each with its memory', async ({ page }) => {
  await openLab(page, path);
  const steps = view(page, 'graph').locator('.step');
  await expect(steps).toHaveCount(23);
  await expect(steps.first().locator('.cell')).toHaveCount(20);
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(23);
});

test('after "the c" the network expects "a"', async ({ page }) => {
  await openLab(page, path);
  await page.locator('#rnn-text').fill('the c');
  await expect(page.locator('[data-live="next"]')).toContainText('“a”');
});

test('a lower temperature makes the best guess surer', async ({ page }) => {
  await openLab(page, path);
  await page.locator('#rnn-text').fill('the ');
  const next = page.locator('[data-live="next"] strong');
  const before = Number.parseFloat(await next.innerText());
  await page.locator('#slider-temperature').focus();
  await page.keyboard.press('Home');
  await expect(next).not.toHaveText(`${before}%`);
  expect(Number.parseFloat(await next.innerText())).toBeGreaterThan(before);
});

test('Write adds a character, and Reset takes the sentence back', async ({
  page,
}) => {
  await openLab(page, path);
  const box = page.locator('#rnn-text');
  const before = await box.inputValue();
  await page.getByRole('button', { name: 'Write' }).click();
  await expect(box).not.toHaveValue(before);
  await expect(view(page, 'graph').locator('.step')).toHaveCount(24);
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(box).toHaveValue(before);
});

test('unknown characters are skipped and named', async ({ page }) => {
  await openLab(page, path);
  await page.locator('#rnn-text').fill('Hi 9!');
  await expect(page.getByText('Skipped')).toContainText('9 !');
  await expect(view(page, 'graph').locator('.step')).toHaveCount(3);
});

test('Next Sentence brings another sentence', async ({ page }) => {
  await openLab(page, path);
  await page.getByRole('button', { name: 'Next Sentence' }).click();
  await expect(page.locator('#rnn-text')).toHaveValue(
    'a bird sang to the tree.',
  );
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
    page.getByRole('heading', { name: 'How the network reads' }),
  ).toBeVisible();
  await expect(page.locator('.katex').first()).toBeVisible();
  await expect(view(page, 'table').locator('tbody tr')).toHaveCount(23);
  await context.close();
});

test('the page has no axe violations in either theme', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'one browser is enough');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await openLab(page, path);
    await view(page, 'table').locator('tbody tr').nth(3).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, scheme).toEqual([]);
  }
});
