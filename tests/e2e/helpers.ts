import type { Page } from '@playwright/test';

import { readdirSync, readFileSync } from 'node:fs';

/** Slugs of the models with this status, read from their meta.ts. */
export function slugsWithStatus(status: 'coming-soon' | 'ready'): string[] {
  return readdirSync('src/models', { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .filter((entry) =>
      new RegExp(`status:\\s*'${status}'`).test(
        readFileSync(`src/models/${entry.name}/meta.ts`, 'utf8'),
      ),
    )
    .map((entry) => entry.name);
}

/** Slugs of the models whose status is 'ready'. */
export function readySlugs(): string[] {
  return slugsWithStatus('ready');
}

/** Opens a page and waits until its Lab island has hydrated. */
export async function openLab(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.locator('astro-island:not([ssr]) .lab').first().waitFor();
}

/** The part of the page a view shows that the learner can see. */
export function view(page: Page, name: 'equation' | 'graph' | 'table') {
  return page.locator(`[data-view="${name}"]:visible`).first();
}
