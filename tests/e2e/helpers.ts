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

/**
 * The graph's plot area on screen, from its clip rectangle. Firefox gives
 * shapes inside <clipPath> an empty box, so map the rect's own attributes.
 */
export async function plotBox(page: Page) {
  return view(page, 'graph')
    .locator('clipPath rect')
    .evaluate((element) => {
      const rect = element as SVGRectElement;
      const m = rect.ownerSVGElement?.getScreenCTM();
      if (!m) throw new Error('no plot');
      return {
        x: m.e + rect.x.baseVal.value * m.a,
        y: m.f + rect.y.baseVal.value * m.d,
        width: rect.width.baseVal.value * m.a,
        height: rect.height.baseVal.value * m.d,
      };
    });
}

/** The part of the page a view shows that the learner can see. */
export function view(page: Page, name: 'equation' | 'graph' | 'table') {
  return page.locator(`[data-view="${name}"]:visible`).first();
}
