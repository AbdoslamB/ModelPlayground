// The three-views contract: every ready
// model's Lab has an interactive graph, a live equation and a data table,
// linked to each other. A model is not ready until this passes.
import { expect, test } from '@playwright/test';

import { openLab, readySlugs, view } from './helpers';

for (const slug of readySlugs()) {
  test.describe(`${slug} meets the three-views contract`, () => {
    test.beforeEach(async ({ page }) => {
      await openLab(page, `models/${slug}/`);
    });

    test('shows a graph, an equation and a table', async ({ page }) => {
      await expect(view(page, 'graph')).toBeVisible();
      await expect(view(page, 'equation')).toBeVisible();
      await expect(view(page, 'table').locator('table')).toBeVisible();
    });

    test('a control changes the equation, the table and the graph', async ({
      page,
    }) => {
      const range = page.locator('.lab input[type="range"]:visible').first();
      await expect(range).toBeVisible();

      const before = {
        equation: await view(page, 'equation').innerText(),
        table: await view(page, 'table').locator('tbody').innerText(),
        graph: await view(page, 'graph').locator('svg').first().innerHTML(),
      };
      await range.focus();
      for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');

      await expect
        .poll(async () => view(page, 'equation').innerText())
        .not.toBe(before.equation);
      await expect
        .poll(async () => view(page, 'table').locator('tbody').innerText())
        .not.toBe(before.table);
      await expect
        .poll(async () =>
          view(page, 'graph').locator('svg').first().innerHTML(),
        )
        .not.toBe(before.graph);
    });

    test('selecting a table row selects its graph item, and back', async ({
      page,
    }) => {
      const table = view(page, 'table');
      const graph = view(page, 'graph');

      await table.locator('tbody tr').first().click();
      const rowId = await table
        .locator('tbody tr[data-selected]')
        .getAttribute('data-row');
      expect(rowId).not.toBeNull();
      await expect(
        graph.locator(`[data-selected][data-id="${rowId ?? ''}"]`),
      ).toHaveCount(1);

      // Now select from the graph, with the keyboard. Park the mouse first:
      // focusing scrolls the page, and a point sliding under a resting
      // cursor is (rightly) selected by hover.
      await page.mouse.move(0, 0);
      // The first keyboard group in the graph walks the items.
      await graph.locator('[role="group"][tabindex="0"]').first().focus();
      await page.keyboard.press('ArrowRight');
      const pointId = await graph
        .locator('[data-selected][data-id]')
        .first()
        .getAttribute('data-id');
      expect(pointId).not.toBeNull();
      await expect(
        table.locator(`tbody tr[data-selected][data-row="${pointId ?? ''}"]`),
      ).toHaveCount(1);
    });

    test('the table works by keyboard alone', async ({ page }) => {
      const table = view(page, 'table');
      await table.locator('[role="region"]').focus();
      await page.keyboard.press('ArrowDown');
      await expect(table.locator('tbody tr[data-selected]')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(table.locator('tbody tr[data-selected]')).toHaveCount(0);
    });
  });
}
