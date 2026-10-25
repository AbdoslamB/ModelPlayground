import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import fixtures from '../../../tests/fixtures/linear-regression.json';
import braking from './data/braking.json';
import plants from './data/plants.json';
import {
  errorMeter,
  fit,
  flatMse,
  lineThrough,
  mse,
  predict,
  r2,
  residuals,
  sums,
} from './math';

// Every batch of every dataset, with its scikit-learn reference.
const cases = [plants, braking].flatMap((dataset) =>
  dataset.batches.map((rows, index) => ({
    name: `${dataset.title}, set ${index + 1}`,
    rows,
    stored: dataset.reference[index],
    ref: fixtures[dataset.id as keyof typeof fixtures][index],
  })),
);

/** Relative closeness, with an absolute floor for values near zero. */
function close(actual: number, expected: number, tolerance = 1e-9) {
  const scale = Math.max(1, Math.abs(expected));
  expect(Math.abs(actual - expected) / scale).toBeLessThan(tolerance);
}

function directMse(xs: number[], ys: number[], a: number, b: number) {
  let total = 0;
  xs.forEach((x, i) => {
    total += ((ys[i] ?? 0) - (a + b * x)) ** 2;
  });
  return total / xs.length;
}

describe.each(cases)('$name matches scikit-learn', ({ rows, stored, ref }) => {
  const xs = rows.map((r) => r.x);
  const ys = rows.map((r) => r.y);
  const s = sums(xs, ys);
  const best = fit(s);
  if (!ref) throw new Error('missing fixture');

  it('finds the best line', () => {
    expect(best).not.toBeNull();
    close(best?.a ?? NaN, ref.a);
    close(best?.b ?? NaN, ref.b);
  });

  it('computes MSE, R² and the means', () => {
    if (!best) throw new Error('no fit');
    close(mse(s, best), ref.mse);
    close(r2(s, best) ?? NaN, ref.r2);
    close(s.xMean, ref.xMean);
    close(s.yMean, ref.yMean);
    close(flatMse(s), ref.flatMse);
  });

  it('predicts at 0, the mean and the maximum', () => {
    if (!best) throw new Error('no fit');
    close(predict(best, 0), ref.predictAt0);
    close(predict(best, ref.xMean), ref.predictAtMean);
    close(predict(best, Math.max(...xs)), ref.predictAtMax);
  });

  it('agrees with the reference stored in the dataset file', () => {
    expect(stored).toEqual(ref);
  });
});

it('each plant was grown from whole a and b between 1 and 10', () => {
  for (const truth of plants.truths) {
    expect(Number.isInteger(truth.a) && Number.isInteger(truth.b)).toBe(true);
    expect(truth.a).toBeGreaterThanOrEqual(1);
    expect(truth.a).toBeLessThanOrEqual(10);
    expect(truth.b).toBeGreaterThanOrEqual(1);
    expect(truth.b).toBeLessThanOrEqual(10);
  }
});

it('every set has 10 points, spread across the x-range', () => {
  for (const { rows } of cases) {
    expect(rows).toHaveLength(10);
    const xs = rows.map((r) => r.x).sort((p, q) => p - q);
    const gaps = xs.slice(1).map((x, i) => x - (xs[i] ?? 0));
    expect(Math.min(...gaps)).toBeGreaterThan(0);
  }
});

it('a straight line through braking data predicts a negative distance at 0 mph', () => {
  for (const ref of fixtures.braking) expect(ref.predictAt0).toBeLessThan(0);
});

describe('edge cases', () => {
  it('returns null when every x is the same', () => {
    expect(fit(sums([2, 2, 2], [1, 5, 3]))).toBeNull();
  });

  it('returns null R² when every y is the same', () => {
    const s = sums([1, 2, 3], [4, 4, 4]);
    expect(r2(s, { a: 4, b: 0 })).toBeNull();
  });

  it('rejects empty or mismatched lists', () => {
    expect(() => sums([], [])).toThrow(RangeError);
    expect(() => sums([1, 2], [1])).toThrow(RangeError);
  });

  it('finds the line through two points', () => {
    expect(lineThrough(1, 3, 3, 7)).toEqual({ a: 1, b: 2 });
  });

  it('lists residuals as y − ŷ', () => {
    expect(residuals({ a: 1, b: 2 }, [0, 1, 2], [1, 4, 4])).toEqual([0, 1, -1]);
  });
});

// Generated datasets: 5–200 rows, finite values up to 10⁶ in size, and x
// spread out enough that a unique best line exists.
const dataset = fc
  .integer({ min: 5, max: 200 })
  .chain((n) =>
    fc.record({
      xs: fc.array(
        fc.double({
          min: -1e6,
          max: 1e6,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        { minLength: n, maxLength: n },
      ),
      ys: fc.array(
        fc.double({
          min: -1e6,
          max: 1e6,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        { minLength: n, maxLength: n },
      ),
    }),
  )
  .filter(({ xs }) => {
    const mean = xs.reduce((t, x) => t + x, 0) / xs.length;
    const sd = Math.sqrt(
      xs.reduce((t, x) => t + (x - mean) ** 2, 0) / xs.length,
    );
    return sd >= 0.1;
  });

const line = fc.record({
  a: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
  b: fc.double({ min: -1e3, max: 1e3, noNaN: true, noDefaultInfinity: true }),
});

describe('properties', () => {
  const runs = { numRuns: 1000 };

  it('the best line has the lowest error', () => {
    fc.assert(
      fc.property(dataset, line, ({ xs, ys }, other) => {
        const s = sums(xs, ys);
        const best = fit(s);
        if (!best) return;
        const tolerance = 1e-9 * Math.max(1, mse(s, other));
        expect(mse(s, best)).toBeLessThanOrEqual(mse(s, other) + tolerance);
      }),
      runs,
    );
  });

  it('the best line has residuals summing to zero, also when weighted by x', () => {
    fc.assert(
      fc.property(dataset, ({ xs, ys }) => {
        const s = sums(xs, ys);
        const best = fit(s);
        if (!best) return;
        const e = residuals(best, xs, ys);
        const scaleY = Math.sqrt(s.syy / s.n) + Math.abs(s.yMean) + 1;
        const scaleX = Math.sqrt(s.sxx / s.n) + Math.abs(s.xMean) + 1;
        const sumE = e.reduce((t, v) => t + v, 0);
        const sumXE = e.reduce((t, v, i) => t + v * (xs[i] ?? 0), 0);
        expect(Math.abs(sumE) / (s.n * scaleY)).toBeLessThan(1e-6);
        expect(Math.abs(sumXE) / (s.n * scaleX * scaleY)).toBeLessThan(1e-6);
      }),
      runs,
    );
  });

  it('the best line passes through the average point', () => {
    fc.assert(
      fc.property(dataset, ({ xs, ys }) => {
        const s = sums(xs, ys);
        const best = fit(s);
        if (!best) return;
        const scale = Math.abs(s.yMean) + Math.sqrt(s.syy / s.n) + 1;
        expect(Math.abs(predict(best, s.xMean) - s.yMean) / scale).toBeLessThan(
          1e-9,
        );
      }),
      runs,
    );
  });

  it('MSE from centered sums equals MSE from a direct loop', () => {
    fc.assert(
      fc.property(dataset, line, ({ xs, ys }, { a, b }) => {
        const s = sums(xs, ys);
        const direct = directMse(xs, ys, a, b);
        expect(Math.abs(mse(s, { a, b }) - direct)).toBeLessThanOrEqual(
          1e-9 * Math.max(1, direct),
        );
      }),
      runs,
    );
  });

  it('adding c to every y raises a* by c and leaves b* unchanged', () => {
    fc.assert(
      fc.property(
        dataset,
        fc.double({ min: -1e3, max: 1e3, noNaN: true }),
        ({ xs, ys }, c) => {
          const before = fit(sums(xs, ys));
          const after = fit(
            sums(
              xs,
              ys.map((y) => y + c),
            ),
          );
          if (!before || !after) return;
          const scale = Math.abs(before.a) + Math.abs(c) + 1;
          expect(Math.abs(after.a - (before.a + c)) / scale).toBeLessThan(1e-6);
          expect(
            Math.abs(after.b - before.b) / (Math.abs(before.b) + 1),
          ).toBeLessThan(1e-6);
        },
      ),
      runs,
    );
  });
});

describe('errorMeter', () => {
  it('labels lines by their ratio to the best error', () => {
    expect(errorMeter(100, 10, 60).label).toBe('Far off');
    expect(errorMeter(15, 10, 60).label).toBe('Getting closer');
    expect(errorMeter(11, 10, 60).label).toBe('Very close');
    expect(errorMeter(10.05, 10, 60).label).toBe('Best possible');
  });

  it('places the best line at 0 and twice the flat-line error at 1', () => {
    expect(errorMeter(10, 10, 60).position).toBe(0);
    expect(errorMeter(120, 10, 60).position).toBeCloseTo(1);
    expect(errorMeter(120, 10, 60).offScale).toBe(false);
  });

  it('pins the marker at the end when the error is off the scale', () => {
    const reading = errorMeter(500, 10, 60);
    expect(reading.position).toBe(1);
    expect(reading.offScale).toBe(true);
  });

  it('copes with data where every y is the same', () => {
    expect(errorMeter(0, 0, 0)).toMatchObject({ position: 0, offScale: false });
  });

  it('copes with data that a line fits perfectly', () => {
    expect(errorMeter(0, 0, 4)).toMatchObject({ ratio: 1, position: 0 });
    expect(errorMeter(2, 0, 4)).toMatchObject({
      ratio: Infinity,
      position: 0.25,
      label: 'Far off',
    });
  });
});
