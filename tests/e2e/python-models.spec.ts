// "Try it in Python" on every model page. python.spec.ts tests the section
// in depth on Linear Regression; here every model gets the basics, and one
// test runs each model's library-free (or NumPy) program in the browser.
import type { Page } from '@playwright/test';

import { expect, test } from '@playwright/test';

import { openLab, readySlugs } from './helpers';

/** Opens the Python section and waits for the code editor. */
async function openPython(page: Page) {
  const open = await page
    .locator('details.py')
    .evaluate((d) => (d as HTMLDetailsElement).open);
  if (!open) await page.locator('.py__summary').click();
  const editor = page.locator('.py .cm-content');
  await editor.waitFor();
  return editor;
}

for (const slug of readySlugs()) {
  const path = `models/${slug}/`;

  test.describe(`${slug}: Try it in Python`, () => {
    test('opens on the first tab, with the Lab’s program', async ({ page }) => {
      await openLab(page, path);
      const editor = await openPython(page);
      // The editor draws only the lines in view, so check the top of the code.
      await expect(editor).toContainText(/^(import|from|#) /);
      const first = await editor.innerText();
      const tabs = page.locator('.py').getByRole('tab');
      await expect(tabs).toHaveCount(2);
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
      await tabs.last().click();
      await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
      await expect.poll(async () => editor.innerText()).not.toBe(first);
    });

    test('on a phone, the code scrolls inside the editor', async ({
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
    });

    test('without JavaScript, the code can be read', async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false });
      const page = await context.newPage();
      await page.goto(path);
      await page.locator('.py__summary').click();
      await expect(page.locator('#py-code')).toContainText('print(');
      await context.close();
    });
  });
}

test('every model’s Plain Python or NumPy program runs in the browser', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'one download is enough');
  // Python downloads once (about 6 MB, NumPy a few more); each run is quick.
  test.setTimeout(10 * 60_000);
  for (const slug of readySlugs()) {
    await openLab(page, `models/${slug}/`);
    await openPython(page);
    // The tab that is not scikit-learn: Plain Python, or NumPy.
    const tab = page
      .locator('.py')
      .getByRole('tab')
      .filter({ hasNotText: 'scikit-learn' })
      .first();
    await tab.click();
    await page.locator('.py').getByRole('button', { name: 'Run' }).click();
    await expect(page.locator('.py__output'), slug).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator('.py__error'), slug).toHaveCount(0);
  }
});
