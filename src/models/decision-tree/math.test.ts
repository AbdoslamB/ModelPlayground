import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Box, Row, Split, TreeNode } from './math';

import fixtures from '../../../tests/fixtures/decision-tree.json';
import beach from './data/beach.json';
import {
  allNodes,
  bestSplit,
  candidates,
  classCounts,
  gain,
  gini,
  grow,
  leafFor,
  leafImpurity,
  leaves,
  nodeAt,
  partition,
  rightCount,
} from './math';

const classes = beach.classes.map((c) => c.id);
const box = beach.axes as unknown as Box;
const depths = [1, 2, 3, 4] as const;

function splitsOf(tree: TreeNode): [string, string, number][] {
  return allNodes(tree)
    .filter((n) => n.split)
    .map((n) => [n.path, n.split?.feature ?? '', n.split?.threshold ?? NaN]);
}

const cases = beach.batches.flatMap((rows, index) =>
  depths.map((depth) => ({
    name: `set ${index + 1}, depth ${depth}`,
    rows: rows,
    depth,
    fixture: fixtures[index],
  })),
);

describe.each(cases)(
  '$name matches scikit-learn',
  ({ rows, depth, fixture }) => {
    if (!fixture) throw new Error('missing fixture');
    const expected = fixture[String(depth) as '1'];
    const tree = grow(rows, classes, depth, box);

    it('asks the same questions, in the same places', () => {
      const ours = splitsOf(tree);
      expect(ours.map(([path, feature]) => [path, feature])).toEqual(
        expected.splits.map(([path, feature]) => [path, feature]),
      );
      ours.forEach(([, , threshold], i) => {
        expect(threshold).toBeCloseTo(Number(expected.splits[i]?.[2]), 9);
      });
    });

    it('labels every point of a grid the same way', () => {
      const [x0, x1] = fixture.gridAxes.x;
      const [y0, y1] = fixture.gridAxes.y;
      const n = fixture.gridSize;
      const ours: string[] = [];
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const point = {
            x: x0 + ((x1 - x0) * i) / (n - 1),
            y: y0 + ((y1 - y0) * j) / (n - 1),
          };
          ours.push(leafFor(tree, point).prediction);
        }
      }
      expect(ours).toEqual(expected.grid);
    });

    it('gets the same number of its own days right', () => {
      expect(rightCount(tree, rows)).toBe(expected.trainingRight);
    });
  },
);

describe('data', () => {
  it('every set has 20 days with both kinds', () => {
    for (const rows of beach.batches) {
      expect(rows).toHaveLength(20);
      const counts = classCounts(rows, classes);
      expect(Math.min(...counts)).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('examples', () => {
  const rows: Row[] = [
    { id: 1, x: 1, y: 5, label: 'a' },
    { id: 2, x: 2, y: 1, label: 'a' },
    { id: 3, x: 3, y: 5, label: 'b' },
    { id: 4, x: 4, y: 1, label: 'b' },
  ];
  const ab = ['a', 'b'];
  const square: Box = { x: [0, 5], y: [0, 6] };

  it('measures Gini impurity', () => {
    expect(gini([4, 0])).toBe(0);
    expect(gini([2, 2])).toBe(0.5);
    expect(gini([3, 1])).toBe(0.375);
    expect(gini([0, 0])).toBe(0);
  });

  it('splits rows: at or below the threshold go left', () => {
    const [left, right] = partition(rows, { feature: 'x', threshold: 2 });
    expect(left.map((r) => r.id)).toEqual([1, 2]);
    expect(right.map((r) => r.id)).toEqual([3, 4]);
  });

  it('measures gain: parent minus the weighted children', () => {
    expect(gain(rows, { feature: 'x', threshold: 2.5 }, ab)).toBe(0.5);
    expect(gain(rows, { feature: 'y', threshold: 3 }, ab)).toBe(0);
    expect(gain([], { feature: 'y', threshold: 3 }, ab)).toBe(0);
  });

  it('tries thresholds halfway between distinct values', () => {
    expect(candidates(rows, 'y')).toEqual([3]);
    expect(candidates([rows[0]], 'x')).toEqual([]);
  });

  it('finds the best split, and none when every row is the same', () => {
    expect(bestSplit(rows, ab)).toEqual({
      split: { feature: 'x', threshold: 2.5 },
      gain: 0.5,
    });
    expect(bestSplit([rows[0], { ...rows[0], id: 9 }], ab)).toBeNull();
  });

  it('grows until the leaves are pure, and shrinks each box', () => {
    const tree = grow(rows, ab, 3, square);
    expect(tree.split).toEqual({ feature: 'x', threshold: 2.5 });
    expect(leaves(tree).map((l) => [l.path, l.prediction])).toEqual([
      ['L', 'a'],
      ['R', 'b'],
    ]);
    expect(tree.left?.box).toEqual({ x: [0, 2.5], y: [0, 6] });
    expect(tree.right?.box).toEqual({ x: [2.5, 5], y: [0, 6] });
    expect(leafImpurity(tree)).toBe(0);
  });

  it('stops at the depth limit, and on a tie predicts the first class', () => {
    const stump = grow(rows, ab, 0, square);
    expect(stump.split).toBeUndefined();
    expect(stump.prediction).toBe('a');
    expect(leafImpurity(stump)).toBe(0.5);
  });

  it('cannot split identical rows of different classes', () => {
    const same: Row[] = [
      { id: 1, x: 1, y: 1, label: 'a' },
      { id: 2, x: 1, y: 1, label: 'b' },
    ];
    expect(grow(same, ab, 3, square).split).toBeUndefined();
  });

  it('uses a chosen split, and gives an empty side its parent’s label', () => {
    const chosen: Record<string, Split> = {
      '': { feature: 'y', threshold: 9 },
    };
    const tree = grow(rows, ab, 1, square, chosen);
    expect(tree.split).toEqual({ feature: 'y', threshold: 9 });
    expect(tree.gain).toBe(0);
    expect(tree.right?.rows).toEqual([]);
    expect(tree.right?.prediction).toBe('a');
    expect(tree.right?.box).toEqual({ x: [0, 5], y: [6, 6] });
  });

  it('finds nodes by path, and the leaf for any point', () => {
    const tree = grow(rows, ab, 3, square);
    expect(nodeAt(tree, 'R')?.prediction).toBe('b');
    expect(nodeAt(tree, 'RL')).toBeUndefined();
    expect(leafFor(tree, { x: 0, y: 0 }).path).toBe('L');
    expect(rightCount(tree, rows)).toBe(4);
  });

  it('weighs nothing for an empty tree', () => {
    expect(leafImpurity(grow([], ab, 3, square))).toBe(0);
  });

  it('predicts nothing when there are no classes', () => {
    expect(grow(rows, [], 0, square).prediction).toBe('');
    expect(grow([], [], 0, square).prediction).toBe('');
  });
});

const rowsArb = fc
  .array(
    fc.record({
      x: fc.integer({ min: 0, max: 20 }),
      y: fc.integer({ min: 0, max: 20 }),
      label: fc.constantFrom('a', 'b', 'c'),
    }),
    { minLength: 1, maxLength: 30 },
  )
  .map((rows) => rows.map((row, index) => ({ ...row, id: index + 1 })));
const abc = ['a', 'b', 'c'];
const area: Box = { x: [0, 20], y: [0, 20] };

describe('properties', () => {
  const runs = { numRuns: 300 };

  it('a split never raises the impurity (gain ≥ 0)', () => {
    fc.assert(
      fc.property(
        rowsArb,
        fc.constantFrom<'x' | 'y'>('x', 'y'),
        fc.double({ min: -1, max: 21, noNaN: true }),
        (rows, feature, threshold) => {
          expect(
            gain(rows, { feature, threshold }, abc),
          ).toBeGreaterThanOrEqual(-1e-12);
        },
      ),
      runs,
    );
  });

  it('the best split beats every other candidate', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const best = bestSplit(rows, abc);
        for (const feature of ['x', 'y'] as const) {
          for (const threshold of candidates(rows, feature)) {
            expect(best?.gain ?? -1).toBeGreaterThanOrEqual(
              gain(rows, { feature, threshold }, abc) - 1e-12,
            );
          }
        }
      }),
      runs,
    );
  });

  it('every row lands in exactly the leaf that holds it', () => {
    fc.assert(
      fc.property(rowsArb, fc.integer({ min: 0, max: 5 }), (rows, depth) => {
        const tree = grow(rows, abc, depth, area);
        const held = leaves(tree).flatMap((l) => l.rows.map((r) => r.id));
        expect([...held].sort((p, q) => p - q)).toEqual(rows.map((r) => r.id));
        for (const row of rows) {
          expect(leafFor(tree, row).rows).toContain(row);
        }
      }),
      runs,
    );
  });

  it('a deeper tree is never wrong more often on its own data', () => {
    fc.assert(
      fc.property(rowsArb, fc.integer({ min: 0, max: 4 }), (rows, depth) => {
        const shallow = grow(rows, abc, depth, area);
        const deep = grow(rows, abc, depth + 1, area);
        expect(rightCount(deep, rows)).toBeGreaterThanOrEqual(
          rightCount(shallow, rows),
        );
        expect(leafImpurity(deep)).toBeLessThanOrEqual(
          leafImpurity(shallow) + 1e-12,
        );
      }),
      runs,
    );
  });
});
