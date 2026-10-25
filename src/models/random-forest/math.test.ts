import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Box, Row, TreeNode } from './math';

import fixtures from '../../../tests/fixtures/random-forest.json';
import seeds from './data/seeds.json';
import {
  bestThreshold,
  coverage,
  gini,
  growTree,
  leafFor,
  leaves,
  makeForest,
  makeTree,
  outOfBag,
  questionCount,
  tally,
  treeSeed,
  voteGrid,
} from './math';

const classes = seeds.classes.map((c) => c.id);
const box = seeds.axes as unknown as Box;

function splitsOf(node: TreeNode): [string, string, number][] {
  if (!node.left || !node.right) return [];
  return [
    [node.path, node.feature ?? '', node.threshold ?? NaN],
    ...splitsOf(node.left),
    ...splitsOf(node.right),
  ];
}

const sets = seeds.batches.map((rows, index) => ({
  name: `set ${index + 1}`,
  rows: rows,
  fixture: fixtures[index],
}));

describe.each(sets)('$name matches the Python forest', ({ rows, fixture }) => {
  if (!fixture) throw new Error('missing fixture');
  const forest = makeForest(
    rows,
    classes,
    seeds.maxDepth,
    box,
    fixture.forestSeed,
    fixture.trees.length,
  );

  it('draws the same bootstrap samples', () => {
    forest.forEach((tree, i) => {
      expect(tree.sample).toEqual(fixture.trees[i]?.sample);
    });
  });

  it('asks the same questions (each one checked with scikit-learn)', () => {
    forest.forEach((tree, i) => {
      const ours = splitsOf(tree.root);
      const theirs = fixture.trees[i]?.splits ?? [];
      expect(ours.map(([p, f]) => [p, f])).toEqual(
        theirs.map(([p, f]) => [p, f]),
      );
      ours.forEach(([, , t], j) => {
        expect(t).toBeCloseTo(Number(theirs[j]?.[2]), 9);
      });
    });
  });

  it.each(Object.keys(fixture.forests))(
    'with %s trees, votes the same on a grid and out of bag',
    (size) => {
      const expected = fixture.forests[size as '1'];
      const trees = forest.slice(0, Number(size));
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
          ours.push(tally(trees, classes, point).winner);
        }
      }
      expect(ours).toEqual(expected.grid);
      expect(outOfBag(rows, trees, classes)).toEqual(expected.outOfBag);
    },
  );
});

describe('data', () => {
  it('every set has 30 seeds with both kinds', () => {
    for (const rows of seeds.batches) {
      expect(rows).toHaveLength(30);
      for (const c of classes) {
        expect(rows.filter((r) => r.label === c).length).toBeGreaterThan(5);
      }
    }
  });

  it('the number of trees is always odd, so two kinds never tie', () => {
    const { min, step } = seeds.trees;
    expect(min % 2).toBe(1);
    expect(step % 2).toBe(0);
  });
});

describe('examples', () => {
  const rows: Row[] = [
    { id: 1, x: 1, y: 1, label: 'a' },
    { id: 2, x: 2, y: 1, label: 'a' },
    { id: 3, x: 3, y: 1, label: 'b' },
    { id: 4, x: 4, y: 1, label: 'b' },
  ];
  const ab = ['a', 'b'];
  const area: Box = { x: [0, 5], y: [0, 5] };

  it('measures Gini impurity', () => {
    expect(gini([])).toBe(0);
    expect(gini(['a', 'a'])).toBe(0);
    expect(gini(['a', 'b'])).toBe(0.5);
  });

  it('finds the best threshold on one feature, or none', () => {
    expect(bestThreshold(rows, 'x')).toEqual({ threshold: 2.5, gain: 0.5 });
    expect(bestThreshold(rows, 'y')).toBeNull();
  });

  it('falls back to the other feature when the random one cannot split', () => {
    // A random number ≥ 0.5 picks y first; y is constant, so x is used.
    const tree = growTree(rows, ab, 2, area, () => 0.9);
    expect(tree.feature).toBe('x');
    expect(leaves(tree).map((l) => l.prediction)).toEqual(['a', 'b']);
    expect(tree.left?.box).toEqual({ x: [0, 2.5], y: [0, 5] });
  });

  it('cannot split rows that are all alike', () => {
    const same: Row[] = [
      { id: 1, x: 1, y: 1, label: 'a' },
      { id: 2, x: 1, y: 1, label: 'b' },
    ];
    const tree = growTree(same, ab, 2, area, () => 0.1);
    expect(tree.feature).toBeUndefined();
    expect(questionCount(tree)).toBe(0);
  });

  it('predicts nothing without classes', () => {
    expect(growTree(rows, [], 0, area, () => 0).prediction).toBe('');
    expect(tally([], [], { x: 0, y: 0 }).winner).toBe('');
  });

  it('gives every tree its own seed', () => {
    expect(treeSeed(1, 0)).toBe(1000);
    expect(treeSeed(2, 4)).toBe(2004);
  });

  it('counts the rows a tree saw and left out', () => {
    const tree = makeTree(rows, ab, 2, area, 1, 0);
    const { seen, left } = coverage(tree, rows.length);
    expect(seen + left).toBe(4);
    expect(seen).toBe(new Set(tree.sample).size);
  });

  it('skips rows that every tree saw when scoring out of bag', () => {
    const all = {
      id: 1,
      sample: [0, 1, 2, 3],
      root: growTree(rows, ab, 2, area, () => 0.1),
    };
    expect(outOfBag(rows, [all], ab)).toEqual({ right: 0, judged: 0 });
  });

  it('shades a grid by the share of votes for the second class', () => {
    const tree = {
      id: 1,
      sample: [],
      root: growTree(rows, ab, 2, area, () => 0.1),
    };
    expect(voteGrid([tree], ab, area, 2, 1)).toEqual([0, 1]);
    expect(voteGrid([], ab, area, 1, 1)).toEqual([0]);
  });

  it('finds the leaf for a point', () => {
    const tree = growTree(rows, ab, 2, area, () => 0.1);
    expect(leafFor(tree, { x: 0, y: 0 }).prediction).toBe('a');
    expect(leafFor(tree, { x: 5, y: 0 }).prediction).toBe('b');
  });
});

const rowsArb = fc
  .array(
    fc.record({
      x: fc.integer({ min: 0, max: 20 }),
      y: fc.integer({ min: 0, max: 20 }),
      label: fc.constantFrom('a', 'b'),
    }),
    { minLength: 1, maxLength: 25 },
  )
  .map((list) => list.map((row, index) => ({ ...row, id: index + 1 })));
const field: Box = { x: [0, 20], y: [0, 20] };

describe('properties', () => {
  const runs = { numRuns: 200 };

  it('a tree never depends on how many trees grow beside it', () => {
    fc.assert(
      fc.property(rowsArb, fc.integer({ min: 1, max: 99 }), (list, seed) => {
        const small = makeForest(list, ['a', 'b'], 3, field, seed, 2);
        const big = makeForest(list, ['a', 'b'], 3, field, seed, 6);
        expect(big.slice(0, 2)).toEqual(small);
      }),
      runs,
    );
  });

  it('every bootstrap sample has one draw per row, all in range', () => {
    fc.assert(
      fc.property(rowsArb, fc.integer({ min: 1, max: 99 }), (list, seed) => {
        const tree = makeTree(list, ['a', 'b'], 3, field, seed, 0);
        expect(tree.sample).toHaveLength(list.length);
        for (const i of tree.sample) {
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(list.length);
        }
      }),
      runs,
    );
  });

  it('the votes for a point add up to the number of trees', () => {
    fc.assert(
      fc.property(
        rowsArb,
        fc.integer({ min: 1, max: 9 }),
        fc.record({
          x: fc.double({ min: 0, max: 20, noNaN: true }),
          y: fc.double({ min: 0, max: 20, noNaN: true }),
        }),
        (list, size, point) => {
          const forest = makeForest(list, ['a', 'b'], 3, field, 1, size);
          const { counts } = tally(forest, ['a', 'b'], point);
          expect(counts.reduce((t, c) => t + c, 0)).toBe(size);
        },
      ),
      runs,
    );
  });

  it('the out-of-bag score never judges more rows than there are', () => {
    fc.assert(
      fc.property(rowsArb, fc.integer({ min: 1, max: 9 }), (list, size) => {
        const forest = makeForest(list, ['a', 'b'], 3, field, 1, size);
        const { right, judged } = outOfBag(list, forest, ['a', 'b']);
        expect(right).toBeLessThanOrEqual(judged);
        expect(judged).toBeLessThanOrEqual(list.length);
      }),
      runs,
    );
  });
});
