// Re-checks the contrast of the color tokens in both themes, straight from
// tokens.css: text needs 4.5:1, chart marks and control edges 3:1.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/tokens.css', 'utf8');
const tokens = new Map<string, [string, string]>();
for (const [, name, light, dark] of css.matchAll(
  /(--c-[\w-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi,
)) {
  if (name && light && dark) tokens.set(name, [light, dark]);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

function pairs(
  foregrounds: string[],
  backgrounds: string[],
): [string, string][] {
  return foregrounds.flatMap((f) =>
    backgrounds.map((b): [string, string] => [f, b]),
  );
}

const text = [
  '--c-text',
  '--c-muted',
  '--c-line-ink',
  '--c-best-ink',
  '--c-error-ink',
  '--c-a-ink',
  '--c-b-ink',
  '--c-class-1-ink',
  '--c-class-2-ink',
  '--c-class-3-ink',
  '--c-class-4-ink',
];
const marks = [
  '--c-data',
  '--c-line',
  '--c-best',
  '--c-error',
  '--c-a',
  '--c-b',
  '--c-class-1',
  '--c-class-2',
  '--c-class-3',
  '--c-class-4',
  '--c-control-edge',
];

const checks: { fg: string; bg: string; min: number }[] = [
  ...pairs(text, ['--c-bg', '--c-surface']).map(([fg, bg]) => ({
    fg,
    bg,
    min: 4.5,
  })),
  // Highlighted symbols and selected rows keep readable text.
  ...pairs(text, ['--c-highlight']).map(([fg, bg]) => ({ fg, bg, min: 4.5 })),
  { fg: '--c-muted', bg: '--c-surface-sunken', min: 4.5 },
  { fg: '--c-on-primary', bg: '--c-primary', min: 4.5 },
  // Chart marks are always drawn on the card surface.
  ...pairs(marks, ['--c-surface']).map(([fg, bg]) => ({ fg, bg, min: 3 })),
];

describe.each([
  ['light', 0],
  ['dark', 1],
] as const)('%s theme', (_, theme) => {
  it.each(checks)('$fg on $bg reaches $min:1', ({ fg, bg, min }) => {
    const front = tokens.get(fg)?.[theme];
    const back = tokens.get(bg)?.[theme];
    expect(front, fg).toBeDefined();
    expect(back, bg).toBeDefined();
    expect(contrast(front ?? '', back ?? '')).toBeGreaterThanOrEqual(min);
  });
});
