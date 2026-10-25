/**
 * Linear Regression math. Pure functions: no DOM, no state, so this file can
 * move into a Web Worker unchanged. Every number the learner sees comes from
 * here, and math.test.ts checks it against scikit-learn.
 *
 * Everything is computed from centered sums (x̄, ȳ, Sxx, Sxy, Syy). Updating
 * the error when a or b changes then costs the same for any number of rows,
 * and stays accurate when the data sits far from zero.
 */

export interface Sums {
  n: number;
  xMean: number;
  yMean: number;
  /** Σ (xᵢ − x̄)² */
  sxx: number;
  /** Σ (xᵢ − x̄)(yᵢ − ȳ) */
  sxy: number;
  /** Σ (yᵢ − ȳ)² */
  syy: number;
}

export interface Line {
  a: number;
  b: number;
}

/** Centered sums, in two passes for accuracy. */
export function sums(xs: readonly number[], ys: readonly number[]): Sums {
  const n = xs.length;
  if (n === 0 || n !== ys.length) {
    throw new RangeError('sums() needs two non-empty lists of equal length');
  }
  let xTotal = 0;
  let yTotal = 0;
  for (let i = 0; i < n; i++) {
    xTotal += xs[i];
    yTotal += ys[i];
  }
  const xMean = xTotal / n;
  const yMean = yTotal / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  return { n, xMean, yMean, sxx, sxy, syy };
}

/**
 * The least-squares line. Returns null when every x is the same, because
 * then no single slope fits best.
 */
export function fit(s: Sums): Line | null {
  if (s.sxx <= 0) return null;
  const b = s.sxy / s.sxx;
  return { a: s.yMean - b * s.xMean, b };
}

export function predict(line: Line, x: number): number {
  return line.a + line.b * x;
}

/**
 * The line through two points; dragging a handle pivots the line around the
 * other handle this way. The two x values must differ.
 */
export function lineThrough(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Line {
  const b = (y2 - y1) / (x2 - x1);
  return { a: y1 - b * x1, b };
}

/** eᵢ = yᵢ − ŷᵢ for every row: positive when the line is too low. */
export function residuals(
  line: Line,
  xs: readonly number[],
  ys: readonly number[],
): number[] {
  return xs.map((x, i) => ys[i] - predict(line, x));
}

/**
 * Mean squared error of any line, in constant time:
 * MSE = (Syy − 2b·Sxy + b²·Sxx) / n + c², with c = a + b·x̄ − ȳ.
 */
export function mse(s: Sums, line: Line): number {
  const { a, b } = line;
  const c = a + b * s.xMean - s.yMean;
  const spread = (s.syy - 2 * b * s.sxy + b * b * s.sxx) / s.n;
  // The spread term is a sum of squares; rounding can push it a hair below 0.
  return Math.max(0, spread) + c * c;
}

/**
 * R² = 1 − Σeᵢ² / Σ(yᵢ − ȳ)². 0 means no better than always guessing the
 * average; below 0 means worse. Null when every y is the same.
 */
export function r2(s: Sums, line: Line): number | null {
  if (s.syy <= 0) return null;
  return 1 - (mse(s, line) * s.n) / s.syy;
}

/** Error of the best flat line (b = 0, a = ȳ): the variance of y. */
export function flatMse(s: Sums): number {
  return s.syy / s.n;
}

export type MeterLabel =
  'Best possible' | 'Far off' | 'Getting closer' | 'Very close';

export interface MeterReading {
  /** Your error divided by the best possible error. */
  ratio: number;
  /** Marker position on the bar, 0 (best) to 1 (twice the flat-line error). */
  position: number;
  /** True when your error is beyond the end of the bar. */
  offScale: boolean;
  label: MeterLabel;
}

/**
 * Where a line's error sits on the error meter. The bar runs on a log scale
 * from the best possible error to twice the error of the best flat line.
 */
export function errorMeter(
  current: number,
  best: number,
  flat: number,
): MeterReading {
  const top = Math.max(2 * flat, best);
  const ratio = best > 0 ? current / best : current > 0 ? Infinity : 1;
  let position: number;
  if (best > 0 && top > best) {
    position = Math.log(current / best) / Math.log(top / best);
  } else {
    position = top > 0 ? current / top : 0;
  }
  const label: MeterLabel =
    ratio > 2
      ? 'Far off'
      : ratio > 1.2
        ? 'Getting closer'
        : ratio > 1.01
          ? 'Very close'
          : 'Best possible';
  return {
    ratio,
    position: Math.min(1, Math.max(0, position)),
    offScale: current > top,
    label,
  };
}
