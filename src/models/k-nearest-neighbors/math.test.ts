import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import fixtures from '../../../tests/fixtures/k-nearest-neighbors.json';
import fruit from './data/fruit.json';
import {
  classify,
  distance,
  labelGrid,
  leaveOneOut,
  rankByDistance,
  vote,
} from './math';

const sets = fruit.batches.map((rows, index) => ({
  name: `set ${index + 1}`,
  rows,
  fixture: fixtures[index],
}));

describe.each(sets)('$name matches scikit-learn', ({ rows, fixture }) => {
  if (!fixture) throw new Error('missing fixture');

  it.each(fruit.ks)('k = %i classifies every test fruit the same', (k) => {
    const expected = fixture.predictions[String(k) as '1'];
    const ours = fixture.queries.map(([x = 0, y = 0]) =>
      classify(rows, { x, y }, k),
    );
    expect(ours).toEqual(expected);
  });

  it.each(fruit.ks)('k = %i has the same leave-one-out score', (k) => {
    expect(leaveOneOut(rows, k)).toBe(fixture.leaveOneOut[String(k) as '1']);
  });
});

describe('data', () => {
  it('every set has 7 apples and 7 pears, at least 0.35 cm apart', () => {
    for (const rows of fruit.batches) {
      expect(rows.filter((r) => r.label === 'apple')).toHaveLength(7);
      expect(rows.filter((r) => r.label === 'pear')).toHaveLength(7);
      for (const a of rows) {
        for (const b of rows) {
          if (a.id !== b.id)
            expect(distance(a, b)).toBeGreaterThanOrEqual(0.349);
        }
      }
    }
  });

  it('k only takes odd values, so two labels can never tie', () => {
    for (const k of fruit.ks) expect(k % 2).toBe(1);
  });
});

describe('examples', () => {
  const rows = [
    { id: 1, x: 0, y: 0, label: 'a' },
    { id: 2, x: 3, y: 4, label: 'b' },
    { id: 3, x: 1, y: 0, label: 'b' },
    { id: 4, x: 0, y: 2, label: 'a' },
  ];

  it('measures straight-line distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('ranks nearest first, with ranks from 1', () => {
    const ranked = rankByDistance(rows, { x: 0, y: 0 });
    expect(ranked.map((r) => r.row.id)).toEqual([1, 3, 4, 2]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('breaks equal distances by id', () => {
    const ranked = rankByDistance(
      [
        { id: 2, x: 1, y: 0, label: 'a' },
        { id: 1, x: -1, y: 0, label: 'b' },
      ],
      { x: 0, y: 0 },
    );
    expect(ranked.map((r) => r.row.id)).toEqual([1, 2]);
  });

  it('counts the votes of the k nearest', () => {
    const result = vote(rankByDistance(rows, { x: 0, y: 0 }), 3);
    expect(result).toEqual({ counts: { a: 2, b: 1 }, winner: 'a' });
  });

  it('on a tie, keeps the label of the nearest voter', () => {
    const result = vote(rankByDistance(rows, { x: 0, y: 0 }), 2);
    expect(result.winner).toBe('a');
  });

  it('labels a grid of cells, row by row from the top', () => {
    const grid = labelGrid(
      [
        { id: 1, x: 0, y: 0, label: 'low' },
        { id: 2, x: 0, y: 10, label: 'high' },
      ],
      1,
      { x: [0, 10], y: [0, 10] },
      2,
      2,
    );
    expect(grid).toEqual(['high', 'high', 'low', 'low']);
  });

  it('scores each row with the others only', () => {
    expect(
      leaveOneOut(
        [
          { id: 1, x: 0, y: 0, label: 'a' },
          { id: 2, x: 0, y: 1, label: 'a' },
          { id: 3, x: 9, y: 9, label: 'b' },
        ],
        1,
      ),
    ).toBe(2);
  });
});

const labelled = fc
  .array(
    fc.record({
      x: fc.double({ min: -100, max: 100, noNaN: true }),
      y: fc.double({ min: -100, max: 100, noNaN: true }),
      label: fc.constantFrom('a', 'b'),
    }),
    { minLength: 1, maxLength: 40 },
  )
  .map((rows) => rows.map((row, index) => ({ ...row, id: index + 1 })));
const point = fc.record({
  x: fc.double({ min: -100, max: 100, noNaN: true }),
  y: fc.double({ min: -100, max: 100, noNaN: true }),
});

describe('properties', () => {
  const runs = { numRuns: 500 };

  it('distance is symmetric, never negative, and obeys the triangle rule', () => {
    fc.assert(
      fc.property(point, point, point, (a, b, c) => {
        expect(distance(a, b)).toBe(distance(b, a));
        expect(distance(a, b)).toBeGreaterThanOrEqual(0);
        expect(distance(a, c)).toBeLessThanOrEqual(
          distance(a, b) + distance(b, c) + 1e-9,
        );
      }),
      runs,
    );
  });

  it('k = 1 gives the label of the nearest row', () => {
    fc.assert(
      fc.property(labelled, point, (rows, q) => {
        const nearest = rankByDistance(rows, q)[0];
        expect(classify(rows, q, 1)).toBe(nearest?.row.label);
      }),
      runs,
    );
  });

  it('the votes add up to k (or to every row, if there are fewer)', () => {
    fc.assert(
      fc.property(
        labelled,
        point,
        fc.integer({ min: 1, max: 9 }),
        (rows, q, k) => {
          const { counts } = vote(rankByDistance(rows, q), k);
          const total = Object.values(counts).reduce((t, n) => t + n, 0);
          expect(total).toBe(Math.min(k, rows.length));
        },
      ),
      runs,
    );
  });

  it('the answer does not depend on the order of the rows', () => {
    fc.assert(
      fc.property(
        labelled,
        point,
        fc.integer({ min: 1, max: 9 }),
        (rows, q, k) => {
          expect(classify([...rows].reverse(), q, k)).toBe(
            classify(rows, q, k),
          );
        },
      ),
      runs,
    );
  });

  it('the leave-one-out score is between 0 and the number of rows', () => {
    fc.assert(
      fc.property(labelled, fc.integer({ min: 1, max: 9 }), (rows, k) => {
        const right = leaveOneOut(rows, k);
        expect(right).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(rows.length);
      }),
      { numRuns: 200 },
    );
  });
});
