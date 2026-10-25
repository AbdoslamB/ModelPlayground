import { ticks } from 'd3-array';

/** Rounds up to a tidy axis end: the next multiple of 10 (or of 2 below 20). */
export function niceTop(value: number): number {
  const step = value <= 20 ? 2 : 10;
  return Math.max(step, Math.ceil(value / step) * step);
}

export interface LinearScale {
  (value: number): number;
  invert(pixel: number): number;
  domain: readonly [number, number];
  range: readonly [number, number];
  ticks(count?: number): number[];
}

/** Maps a data interval onto a pixel interval (either direction). */
export function scaleLinear(
  domain: readonly [number, number],
  range: readonly [number, number],
): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = (r1 - r0) / (d1 - d0);
  const scale = (value: number) => r0 + (value - d0) * k;
  scale.invert = (pixel: number) => d0 + (pixel - r0) / k;
  scale.domain = domain;
  scale.range = range;
  scale.ticks = (count = 6) => ticks(d0, d1, count);
  return scale;
}
