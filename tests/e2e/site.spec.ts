import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { readySlugs, slugsWithStatus } from './helpers';

test('every sidebar link opens its page', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'desktop sidebar');
  await page.goto('');
  const links = page.locator('nav[aria-label="Models"] a');
  // The Coming soon group exists only while some models are still to come.
  const soon = page.locator('.soon__summary');
  if ((await soon.count()) > 0) await soon.click();
  const hrefs = await links.evaluateAll((all) =>
    all.map((a) => a.getAttribute('href') ?? ''),
  );
  expect(hrefs).toHaveLength(11);
  for (const href of hrefs) {
    expect(href.startsWith('/ModelPlayground/models/')).toBe(true);
    const response = await page.request.get(href);
    expect(response.status(), href).toBe(200);
  }
});

test('the phone drawer opens, keeps focus inside and closes', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('pixel'), 'phone only');
  await page.goto('');
  const menu = page.locator('[data-menu-button]');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#main')).toHaveJSProperty('inert', true);
  await expect(page.locator('#sidebar a').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');

  await menu.click();
  await page.locator('#sidebar a', { hasText: 'Linear Regression' }).click();
  await expect(page).toHaveURL(/linear-regression\/$/);
});

test('the desktop sidebar collapses, is remembered, and opens again', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'desktop sidebar');
  await page.goto('models/linear-regression/');
  const button = page.locator('[data-collapse-button]');
  const models = page.locator('nav[aria-label="Models"]');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(models).toBeVisible();

  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toHaveAccessibleName('Show the model list');
  await expect(models).toBeHidden();
  // The rail narrows with a short animation; wait for it to settle.
  await expect
    .poll(async () => (await page.locator('#sidebar').boundingBox())?.width)
    .toBeLessThanOrEqual(64);

  await page.reload();
  await expect(models).toBeHidden();

  await button.click();
  await expect(models).toBeVisible();
  await expect(button).toHaveAccessibleName('Hide the model list');
});

test('the collapsed rail keeps only the expand button and the theme switch', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'desktop sidebar');
  await page.goto('models/linear-regression/');
  const expand = page.locator('[data-collapse-button]');
  await expand.click();
  const rail = page.locator('#sidebar');
  await expect
    .poll(async () => (await rail.boundingBox())?.width)
    .toBeLessThanOrEqual(64);

  // No logo or GitHub link in the rail.
  await expect(
    rail.getByRole('link', { name: 'Model Playground' }),
  ).toBeHidden();
  await expect(rail.getByRole('link', { name: 'GitHub' })).toBeHidden();

  // The theme switch works from the rail, as an icon with the same name.
  const theme = rail.getByRole('button', { name: 'Dark mode' });
  await expect(theme).toBeVisible();
  const pressed = await theme.getAttribute('aria-pressed');
  await theme.click();
  await expect(theme).not.toHaveAttribute('aria-pressed', pressed ?? '');
  await theme.click();

  // Both icons sit inside the rail: expand at the top, theme at the bottom.
  const railBox = await rail.boundingBox();
  for (const icon of [expand, theme]) {
    const box = await icon.boundingBox();
    expect(box && railBox && box.x + box.width <= railBox.x + 64).toBe(true);
  }
  expect((await theme.boundingBox())?.y ?? 0).toBeGreaterThan(
    (railBox?.height ?? 0) / 2,
  );

  // A tooltip names each icon on hover and on keyboard focus; Esc hides it.
  const tip = theme.locator('.rail-tip');
  await theme.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText('Dark mode');
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await page.mouse.move(600, 400);
  await expand.focus();
  await expect(expand.locator('.rail-tip')).toHaveText('Show the model list');
  await expect(expand.locator('.rail-tip')).toBeVisible();

  // Collapsed, the sidebar still has no axe violations.
  const results = await new AxeBuilder({ page }).include('#sidebar').analyze();
  expect(results.violations).toEqual([]);
});

test('Coming soon pages are not indexed, ready pages are', async ({ page }) => {
  const [soon] = slugsWithStatus('coming-soon');
  if (soon) {
    await page.goto(`models/${soon}/`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex',
    );
  }
  await page.goto(`models/${readySlugs()[0] ?? ''}/`);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test('the home page has no axe violations', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'one browser is enough');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, scheme).toEqual([]);
  }
});
