import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Point } from './math';

import fixtures from '../../../tests/fixtures/k-means.json';
import park from './data/park.json';
import {
  assign,
  distance,
  inertia,
  run,
  sameCentres,
  squaredDistance,
  update,
} from './math';

const cases = park.batches.flatMap((rows, index) =>
  park.ks.map((k) => ({
    name: `set ${index + 1}, k = ${k}`,
    rows,
    k,
    expected: fixtures[index]?.[String(k) as '2'],
  })),
);

describe.each(cases)('$name matches scikit-learn', ({ rows, k, expected }) => {
  if (!expected) throw new Error('missing fixture');
  const result = run(rows, park.starts.slice(0, k));

  it('ends with the same stands', () => {
    result.centres.forEach((centre, i) => {
      const [x = NaN, y = NaN] = expected.centres[i] ?? [];
      expect(centre.x).toBeCloseTo(x, 9);
      expect(centre.y).toBeCloseTo(y, 9);
    });
  });

  it('puts every person in the same group', () => {
    expect(result.labels).toEqual(expected.labels);
  });

  it('has the same total squared walk, after the same number of moves', () => {
    expect(inertia(rows, result.labels, result.centres)).toBeCloseTo(
      expected.inertia,
      6,
    );
    expect(result.steps).toBe(expected.steps);
  });
});

describe('data', () => {
  it('every set has 24 people, at least 3 m apart', () => {
    for (const rows of park.batches) {
      expect(rows).toHaveLength(24);
      for (const a of rows) {
        for (const b of rows) {
          if (a.id !== b.id)
            expect(distance(a, b)).toBeGreaterThanOrEqual(2.999);
        }
      }
    }
  });
});

describe('examples', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 10, y: 10 },
    { x: 12, y: 10 },
  ];

  it('measures distance and squared distance', () => {
    expect(squaredDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('assigns each point to its nearest centre, the lower index on a tie', () => {
    expect(
      assign(points, [
        { x: 1, y: 0 },
        { x: 11, y: 10 },
      ]),
    ).toEqual([0, 0, 1, 1]);
    expect(
      assign(
        [{ x: 5, y: 0 }],
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      ),
    ).toEqual([0]);
  });

  it('moves each centre to the middle of its points, and keeps an empty one', () => {
    const moved = update(
      points,
      [0, 0, 1, 1],
      [
        { x: 5, y: 5 },
        { x: 5, y: 5 },
        { x: 50, y: 50 },
      ],
    );
    expect(moved).toEqual([
      { x: 1, y: 0 },
      { x: 11, y: 10 },
      { x: 50, y: 50 },
    ]);
  });

  it('adds up the squared walks', () => {
    expect(
      inertia(
        points,
        [0, 0, 1, 1],
        [
          { x: 1, y: 0 },
          { x: 11, y: 10 },
        ],
      ),
    ).toBe(4);
  });

  it('skips a point whose stand is missing, and reads a missing label as 0', () => {
    expect(
      inertia(
        [
          { x: 0, y: 0 },
          { x: 3, y: 4 },
        ],
        [7],
        [{ x: 0, y: 0 }],
      ),
    ).toBe(25);
  });

  it('stops when nothing moves', () => {
    const result = run(points, [
      { x: 0, y: 0 },
      { x: 12, y: 10 },
    ]);
    expect(result.centres).toEqual([
      { x: 1, y: 0 },
      { x: 11, y: 10 },
    ]);
    expect(result.steps).toBe(1);
  });

  it('compares centres within a tolerance', () => {
    expect(sameCentres([{ x: 1, y: 1 }], [{ x: 1, y: 1 + 1e-12 }])).toBe(true);
    expect(sameCentres([{ x: 1, y: 1 }], [{ x: 1, y: 1.1 }])).toBe(false);
    expect(sameCentres([{ x: 1, y: 1 }], [])).toBe(false);
    expect(sameCentres([{ x: 1, y: 1 }], new Array<Point>(1))).toBe(false);
  });
});

const pointsArb = fc.array(
  fc.record({
    x: fc.double({ min: 0, max: 100, noNaN: true }),
    y: fc.double({ min: 0, max: 100, noNaN: true }),
  }),
  { minLength: 1, maxLength: 40 },
);

describe('properties', () => {
  const runs = { numRuns: 300 };

  it('every point is assigned to a centre at least as near as any other', () => {
    fc.assert(
      fc.property(pointsArb, pointsArb, (points, centres) => {
        const labels = assign(points, centres);
        points.forEach((point, i) => {
          const own = centres[labels[i] ?? 0];
          if (!own) throw new Error('no centre');
          for (const other of centres) {
            expect(squaredDistance(point, own)).toBeLessThanOrEqual(
              squaredDistance(point, other),
            );
          }
        });
      }),
      runs,
    );
  });

  it('one move never makes the total squared walk larger', () => {
    fc.assert(
      fc.property(pointsArb, pointsArb, (points, centres) => {
        const labels = assign(points, centres);
        const before = inertia(points, labels, centres);
        const moved = update(points, labels, centres);
        const after = inertia(points, assign(points, moved), moved);
        expect(after).toBeLessThanOrEqual(before + 1e-6);
      }),
      runs,
    );
  });

  it('a finished run is stable: one more move changes nothing', () => {
    fc.assert(
      fc.property(pointsArb, pointsArb, (points, starts) => {
        const { centres, steps } = run(points, starts);
        if (steps === 100) return;
        const again = update(points, assign(points, centres), centres);
        expect(sameCentres(again, centres)).toBe(true);
      }),
      runs,
    );
  });
});
