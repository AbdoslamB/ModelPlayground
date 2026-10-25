import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Map2D, Schedule } from './math';

import fixtures from '../../../tests/fixtures/t-sne.json';
import data from './data/pictures.json';
import {
  advance,
  conditionalP,
  jointP,
  kept,
  klDivergence,
  mapDistances,
  nearest,
  pairs,
  squaredDistances,
  startRun,
  step,
} from './math';

const schedule = data.schedule as unknown as Schedule;

const cases = data.batches.flatMap((rows, index) =>
  Object.keys(fixtures[index] ?? {}).map((perplexity) => ({
    name: `set ${index + 1}, perplexity ${perplexity}`,
    rows,
    perplexity: Number(perplexity),
    expected: fixtures[index]?.[perplexity as '3'],
  })),
);

describe.each(cases)(
  '$name matches scikit-learn',
  ({ rows, perplexity, expected }) => {
    if (!expected) throw new Error('missing fixture');
    const D = squaredDistances(rows.map((r) => r.pixels));
    const P = jointP(D, perplexity);

    it('gives the same joint probabilities', () => {
      expect(P).toHaveLength(expected.P.length);
      P.forEach((p, k) => {
        expect(p).toBeCloseTo(expected.P[k] ?? NaN, 12);
      });
    });

    it('gives the same KL cost and gradient', () => {
      const { cost, grad } = klDivergence(expected.probe as Map2D, expected.P);
      expect(cost).toBeCloseTo(expected.kl, 10);
      grad.forEach(([gx, gy], i) => {
        expect(gx).toBeCloseTo(expected.grad[2 * i] ?? NaN, 10);
        expect(gy).toBeCloseTo(expected.grad[2 * i + 1] ?? NaN, 10);
      });
    });

    // Maps match for the first 50 steps; after that, rounding noise grows
    // (fastest at a low perplexity), so finished maps are judged by quality.
    it('draws the same map for the first 50 steps', () => {
      let run = startRun(rows.map((r) => r.start as [number, number]));
      for (const steps of Object.keys(expected.maps).map(Number)) {
        run = advance(run, P, schedule, steps);
        const map = expected.maps[String(steps) as '1'];
        run.Y.forEach(([x, y], i) => {
          expect(x).toBeCloseTo(map[i]?.[0] ?? NaN, 3);
          expect(y).toBeCloseTo(map[i]?.[1] ?? NaN, 3);
        });
      }
    });
  },
);

describe.each(cases)(
  '$name: a finished map is as good as scikit-learn’s',
  ({ rows, perplexity, expected }) => {
    if (!expected) throw new Error('missing fixture');
    const D = squaredDistances(rows.map((r) => r.pixels));
    const P = jointP(D, perplexity);
    const run = advance(
      startRun(rows.map((r) => r.start as [number, number])),
      P,
      schedule,
      data.steps.max,
    );
    const map = mapDistances(run.Y);
    const kinds = rows.map((r) => r.kind);
    const purity =
      nearest(map, 5).reduce(
        (t, list, i) =>
          t + list.filter((j) => kinds[j] === kinds[i]).length / 5,
        0,
      ) / rows.length;

    it('has a KL cost close to scikit-learn’s', () => {
      expect(klDivergence(run.Y, P).cost).toBeLessThan(
        expected.finished.kl * 1.5 + 0.05,
      );
    });

    it('keeps pictures of a kind together about as well', () => {
      expect(purity).toBeGreaterThan(expected.finished.purity - 0.15);
    });
  },
);

describe('data', () => {
  it('every set has 10 pictures of each kind, 8 × 8 pixels from 0 to 16', () => {
    for (const rows of data.batches) {
      for (const kind of data.kinds) {
        expect(rows.filter((r) => r.kind === kind.id)).toHaveLength(10);
      }
      for (const r of rows) {
        expect(r.pixels).toHaveLength(64);
        for (const v of r.pixels) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(16);
        }
      }
    }
  });
});

describe('examples', () => {
  it('measures squared distances', () => {
    expect(
      squaredDistances([
        [0, 0],
        [3, 4],
      ]),
    ).toEqual([
      [0, 25],
      [25, 0],
    ]);
  });

  it('lists pairs in condensed order', () => {
    expect(pairs(3)).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it('finds each row’s width: wide for a high perplexity, narrow for a low one', () => {
    const D = squaredDistances([[0], [1], [2], [10]]);
    const wide = conditionalP(D, 2.5);
    const narrow = conditionalP(D, 1.2);
    expect(wide.beta[0]).toBeLessThan(narrow.beta[0] ?? 0);
    for (const row of wide.P) {
      expect(row.reduce((t, v) => t + v, 0)).toBeCloseTo(1, 12);
    }
  });

  it('copes when every other point is far away', () => {
    // exp(−distance × β) is 0 for every neighbour at first.
    const { P } = conditionalP(
      [
        [0, 1e6],
        [1e6, 0],
      ],
      1.5,
    );
    expect(P[0]?.[1]).toBeCloseTo(1, 12);
  });

  it('makes joint probabilities that add up to 1 over all ordered pairs', () => {
    const P = jointP(squaredDistances([[0], [1], [5], [6]]), 2);
    expect(2 * P.reduce((t, v) => t + v, 0)).toBeCloseTo(1, 12);
  });

  it('has zero KL and gradient when the map matches P exactly', () => {
    const Y: Map2D = [
      [0, 0],
      [1, 0],
    ];
    const { Q } = klDivergence(Y, [0.5]);
    const { cost, grad } = klDivergence(Y, Q);
    expect(cost).toBeCloseTo(0, 12);
    expect(grad[0]?.[0]).toBeCloseTo(0, 12);
  });

  it('resets the optimiser when the exaggerated steps end', () => {
    const P = [0.5];
    const short: Schedule = { ...schedule, exaggeratedSteps: 1 };
    const run = advance(
      startRun([
        [0, 0],
        [1e-3, 0],
      ]),
      P,
      short,
      1,
    );
    expect(run.gains[0]?.[0]).not.toBe(1);
    const after = step(run, P, short);
    expect(after.step).toBe(2);
    expect(after.gains[0]?.[0]).toBeCloseTo(0.8, 12);
  });

  it('finds nearest neighbours and counts the ones kept on the map', () => {
    const D = squaredDistances([[0], [1], [2], [10]]);
    expect(nearest(D, 2)).toEqual([
      [1, 2],
      [0, 2],
      [1, 0],
      [2, 1],
    ]);
    const map = mapDistances([
      [0, 0],
      [5, 0],
      [1, 0],
      [9, 0],
    ]);
    expect(kept(nearest(D, 1), nearest(map, 1))).toEqual([0, 0, 0, 0]);
    expect(kept(nearest(D, 2), nearest(map, 2))).toEqual([2, 1, 2, 2]);
  });
});

describe('properties', () => {
  const points = fc.array(
    fc.tuple(
      fc.double({ min: -50, max: 50, noNaN: true }),
      fc.double({ min: -50, max: 50, noNaN: true }),
      fc.double({ min: -50, max: 50, noNaN: true }),
    ),
    { minLength: 4, maxLength: 12 },
  );

  it('every row of p(j | i) adds up to 1 and leaves out i itself', () => {
    fc.assert(
      fc.property(
        points,
        fc.double({ min: 1.5, max: 3, noNaN: true }),
        (X, perplexity) => {
          const { P } = conditionalP(squaredDistances(X), perplexity);
          P.forEach((row, i) => {
            expect(row[i]).toBe(0);
            expect(row.reduce((t, v) => t + v, 0)).toBeCloseTo(1, 9);
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('the KL cost is never negative, and the gradients add up to zero', () => {
    fc.assert(
      fc.property(points, (X) => {
        const P = jointP(squaredDistances(X), 2);
        const Y = X.map(([a, b]) => [a / 10, b / 10] as [number, number]);
        const { cost, grad } = klDivergence(Y, P);
        expect(cost).toBeGreaterThanOrEqual(-1e-12);
        const sum = grad.reduce(
          (t, [gx, gy]) => [t[0] + gx, t[1] + gy],
          [0, 0],
        );
        expect(Math.abs(sum[0] ?? 0)).toBeLessThan(1e-9);
        expect(Math.abs(sum[1] ?? 0)).toBeLessThan(1e-9);
      }),
      { numRuns: 100 },
    );
  });
});
