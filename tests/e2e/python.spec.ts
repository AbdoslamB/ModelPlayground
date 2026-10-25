import type { Page } from '@playwright/test';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab } from './helpers';

const path = 'models/linear-regression/';

/** Opens the Python section and waits for the code editor. */
async function openPython(page: Page) {
  // The section remembers being open, so it may already be.
  const open = await page
    .locator('details.py')
    .evaluate((d) => (d as HTMLDetailsElement).open);
  if (!open) await page.locator('.py__summary').click();
  const editor = page.locator('.py .cm-content');
  await editor.waitFor();
  return editor;
}

test('the code editor is only downloaded when the section is opened', async ({
  page,
}) => {
  const editorFiles: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('codeEditor')) editorFiles.push(request.url());
  });
  await openLab(page, path);
  await page.waitForTimeout(500);
  expect(editorFiles).toEqual([]);
  await openPython(page);
  expect(editorFiles).toHaveLength(1);
});

test('the editor shows line numbers and Python colours, and follows the Lab', async ({
  page,
}) => {
  await openLab(page, path);
  const editor = await openPython(page);
  await expect(
    page.locator('.py .cm-lineNumbers .cm-gutterElement').nth(1),
  ).toHaveText('1');
  // scikit-learn is the tab that opens first.
  await expect(
    page.getByRole('tab', { name: 'With scikit-learn' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toContainText('model = LinearRegression()');
  // Plain Python holds the Lab's line, so it follows the sliders.
  await page.getByRole('tab', { name: 'Plain Python' }).click();
  await expect(editor).toContainText('age = [');
  // Python keywords are coloured by the highlighter.
  const keyword = editor.getByText('def', { exact: true });
  await expect(keyword).toHaveCSS('color', /rgb/);
  const before = await editor.innerText();

  // Moving slider a changes the line in the code.
  await page.locator('#slider-a').focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => editor.innerText()).not.toBe(before);
});

test('edits are kept until Reset brings the Lab’s version back', async ({
  page,
}) => {
  await openLab(page, path);
  const editor = await openPython(page);
  const original = await editor.innerText();
  await editor.fill('print("hello")');
  await expect(page.locator('.py__note')).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).last().click();
  await expect.poll(async () => editor.innerText()).toBe(original);
});

test('Run prints the same numbers as the Lab', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'one download is enough');
  test.setTimeout(120_000);
  await openLab(page, path);
  const miss = await page.locator('.metric__value').first().innerText();
  const editor = await openPython(page);
  // Plain Python downloads 6 MB; scikit-learn's 28 MB is checked by the unit tests.
  await page.getByRole('tab', { name: 'Plain Python' }).click();
  const output = page.locator('.py__output');
  // Nothing to show before the first run.
  await expect(output).toHaveCount(0);
  await page.getByRole('button', { name: 'Run' }).click();
  // The first run takes a moment: the button says it is processing.
  await expect(page.getByRole('button', { name: 'Processing' })).toBeVisible();
  await expect(output).toContainText('Your line:', { timeout: 90_000 });
  await expect(output).toContainText(`Typical miss: yours ${miss}`);
  await expect(page.locator('.py')).not.toContainText('Done in');

  // Ctrl + Enter runs from inside the editor; errors get their own box.
  await editor.fill('print(1 / 0)');
  await editor.press('Control+Enter');
  await expect(page.locator('.py__error')).toContainText('ZeroDivisionError');
  await expect(output).toHaveCount(0);
});

test('the buttons explain themselves on hover and on keyboard focus', async ({
  page,
}) => {
  await openLab(page, path);
  const editor = await openPython(page);
  const tip = page.locator('#py-tip-run');
  await expect(tip).toBeHidden();
  // Tab indents inside the editor; Esc, then Tab, moves on (to Run, as
  // Reset is off until something changes).
  await editor.click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Run' })).toBeFocused();
  await expect(tip).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Run' }),
  ).toHaveAccessibleDescription(
    'Execute your current code and see what happens.',
  );
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
});

test('on a phone, long code lines scroll inside the editor', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'size set by hand');
  await page.setViewportSize({ width: 375, height: 667 });
  await openLab(page, path);
  await openPython(page);
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(375);
  const run = await page.getByRole('button', { name: 'Run' }).boundingBox();
  expect((run?.x ?? 999) + (run?.width ?? 0)).toBeLessThanOrEqual(375);
});

test('without JavaScript, the Python code can still be read', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(path);
  await page.locator('.py__summary').click();
  await expect(page.locator('#py-code')).toContainText('age = [');
  await expect(page.getByRole('button', { name: 'Run' })).toBeHidden();
  await context.close();
});

test('the open Python section has no axe violations', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'one browser is enough');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await openLab(page, path);
    await openPython(page);
    const results = await new AxeBuilder({ page })
      .include('.py')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, scheme).toEqual([]);
  }
});
