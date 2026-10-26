import type { Page } from '@playwright/test';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { openLab, view } from './helpers';

const path = 'models/a-b-testing/';

/** Runs the experiment to its end, saying "keep going" if the VP asks. */
async function runToEnd(page: Page) {
  await page.getByRole('button', { name: 'Run the experiment' }).click();
  const keep = page.getByRole('button', { name: /^Keep going/ });
  const again = page.getByRole('button', { name: 'Run again' });
  await expect(keep.or(again)).toBeVisible({ timeout: 15_000 });
  if (await keep.isVisible()) await keep.click();
  await expect(again).toBeVisible({ timeout: 15_000 });
}

test('seven steps in order, with a step bar that jumps to each', async ({
  page,
}) => {
  await openLab(page, path);
  const steps = page.locator('.step[data-step]');
  await expect(steps).toHaveCount(7);
  const bar = page.getByRole('navigation', { name: 'Steps of the test' });
  await expect(bar.getByRole('link')).toHaveCount(7);
  await bar.getByRole('link').nth(4).click();
  await expect(page).toHaveURL(/#step-5$/);
});

test('step 1: choices give feedback and tick the step off', async ({
  page,
}) => {
  await openLab(page, path);
  const step = page.locator('#step-1');
  await expect(step.locator('.feedback')).toContainText('Half of homepage');
  await step.getByRole('button', { name: /^Search/ }).click();
  await step.getByRole('button', { name: /^Time on site/ }).click();
  await expect(step.locator('.feedback').last()).toContainText('A trap');
  await step.getByRole('button', { name: /^Spend per searcher/ }).click();
  await expect(page.locator('.stepbar a[href="#step-1"].is-done')).toHaveCount(
    1,
  );
});

test('step 2: moving the goalposts after signing is flagged', async ({
  page,
}) => {
  await openLab(page, path);
  await page.getByRole('button', { name: 'Sign the contract' }).click();
  await expect(page.locator('#step-2 .feedback')).toContainText('Signed');
  await page.locator('#slider-mde').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#step-2 .feedback')).toContainText(
    'moving the goalposts',
  );
});

test('step 3: the plan, the duration and the A/A test', async ({ page }) => {
  await openLab(page, path);
  await expect(page.locator('[data-live="days"]')).toContainText('14 days');
  await page.getByRole('button', { name: 'Run the A/A test' }).click();
  await expect(page.locator('[data-live="aa"]')).toContainText(
    'The setup works',
  );
  await expect(page.locator('[data-live="aa"]')).toContainText('beaten itself');
  await page.getByRole('button', { name: /^Stop after 3 days/ }).click();
  await expect(page.locator('[data-live="status"]')).toContainText(
    'Day 1 of 3',
  );
});

test('step 4: the VP asks to stop on day 3; stopping shows the trap', async ({
  page,
}) => {
  await openLab(page, path);
  await page.getByRole('button', { name: 'Run the experiment' }).click();
  const stop = page.getByRole('button', { name: 'Stop and launch now' });
  await expect(stop).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.peek')).toContainText('Day 3');
  await stop.click();
  await expect(page.locator('[data-live="reveal"]')).toContainText(
    'peeking trap',
  );
  await page.getByRole('button', { name: /^Resume to day/ }).click();
  await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('[data-live="reveal"]')).toContainText(
    'Day 14 says',
  );
  await expect(
    page.locator('#step-7 .checks li[data-ok="false"]', {
      hasText: 'peeking trap',
    }),
  ).toHaveCount(1);
});

test('steps 5–7: every scenario reaches its decision', async ({ page }) => {
  await openLab(page, path);
  await runToEnd(page);
  const verdict = page.locator('[data-live="verdict"]');
  await expect(verdict).toHaveText('Launch');
  const expected: [string, string][] = [
    ['Modest lift', 'Not proven: run a longer test'],
    ['Holiday rush', 'Too uncertain: run a bigger test'],
    ['Tracking bug', 'Invalid test: the groups are uneven'],
    ['Novelty', 'Don’t launch: the lift faded'],
    ['Clear win', 'Launch'],
  ];
  for (const [name, decision] of expected) {
    await page
      .locator('#step-5')
      .getByRole('button', { name, exact: true })
      .click();
    await expect(verdict, name).toHaveText(decision);
  }
  await page.locator('#slider-cost').focus();
  await page.keyboard.press('End');
  await expect(verdict).toHaveText(
    'Don’t launch: it may cost more than it earns',
  );
  await expect(page.locator('.cases[data-found="win"]')).toHaveCount(1);
});

test('Many tests draws simulated A/A tests and counts the false alarms', async ({
  page,
}) => {
  await openLab(page, path);
  await page.getByRole('switch', { name: /Many tests/ }).click();
  await expect(view(page, 'graph').locator('.aa')).toHaveCount(20);
  await expect(page.locator('[data-live="many"]')).toContainText('21.2%');
});

test('dragging the today handle moves the day', async ({ page }) => {
  await openLab(page, path);
  await runToEnd(page);
  const handle = view(page, 'graph').locator('.today__hit');
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  const plot = await view(page, 'graph').locator('clipPath rect').boundingBox();
  if (!box || !plot) throw new Error('no handle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(plot.x + plot.width * 0.2, box.y + box.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.locator('[data-live="status"]')).not.toContainText(
    'Day 14 of 14',
  );
});

test('small screens: no sideways scroll', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'sizes set by hand');
  for (const [width, height] of [
    [1440, 900],
    [375, 667],
    [320, 640],
  ] as const) {
    await page.setViewportSize({ width, height });
    await openLab(page, path);
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth, `${width}: no sideways scrolling`).toBeLessThanOrEqual(
      width,
    );
  }
});

test('without JavaScript, the steps, formulas and table are readable', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(path);
  await expect(
    page.getByRole('heading', { name: /The contract/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'A/B testing in short' }),
  ).toBeVisible();
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
    await page.getByRole('button', { name: 'Run the A/A test' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, scheme).toEqual([]);
  }
});

test('every step’s Python program runs in the browser', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'one download is enough');
  test.setTimeout(5 * 60_000);
  await openLab(page, path);
  const boxes = page.locator('details.py');
  await expect(boxes).toHaveCount(4);
  const titles = await boxes.locator('.py__summary').allInnerTexts();
  expect(titles.map((t) => t.trim())).toEqual([
    'Step 3 in Python: plan the test',
    'Step 5 in Python: check the data',
    'Step 6 in Python: test the difference',
    'Step 7 in Python: decide',
  ]);
  for (let i = 0; i < 4; i++) {
    const box = boxes.nth(i);
    await box.locator('.py__summary').click();
    await box.locator('.cm-content').waitFor();
    const plain = box.getByRole('tab', { name: 'Plain Python' });
    if ((await plain.count()) > 0) await plain.click();
    await box.getByRole('button', { name: 'Run' }).click();
    await expect(box.locator('.py__output'), titles[i]).toBeVisible({
      timeout: 120_000,
    });
    await expect(box.locator('.py__error'), titles[i]).toHaveCount(0);
  }
});
