import { describe, expect, it } from 'vitest';

import type { Split, TreeNode } from './math';
import type { PythonData } from './python';

import {
  hasModule,
  lines,
  numbers,
  python,
  runPython,
} from '../../../tests/unit/run-python';
import { datasets } from './data';
import { allNodes, grow, leafImpurity, leaves, rightCount } from './math';
import { plainPython, sklearnPython } from './python';

const dataset = datasets[0];
if (!dataset) throw new Error('no data');
const classes = dataset.classes.map((c) => c.id);
const names = ['temperature', 'wind'] as const;

function data(
  batch: number,
  depth: number,
  chosen: Record<string, Split> = {},
): PythonData {
  return {
    title: dataset.title,
    rows: dataset.batches[batch] ?? [],
    classes,
    names,
    units: ['°C', 'km/h'],
    depth,
    chosen,
  };
}

function treeOf(d: PythonData): TreeNode {
  return grow(d.rows, classes, d.depth, dataset.axes, d.chosen);
}

const cases = [
  data(0, 2),
  data(1, 1),
  data(2, 3),
  data(3, 4),
  data(0, 2, { '': { feature: 'y', threshold: 20 } }),
  data(5, 3, {
    '': { feature: 'x', threshold: 22.5 },
    R: { feature: 'y', threshold: 31.5 },
  }),
];

/** Printed to 2 decimals. */
function near(printed: number | undefined, value: number) {
  expect(Math.abs((printed ?? NaN) - value)).toBeLessThanOrEqual(0.005 + 1e-9);
}

describe('the Python versions print the Lab’s tree', () => {
  it.skipIf(!python)('plain Python: every node, then the totals', () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(plainPython(d));
      expect(ok, error).toBe(true);
      const printed = lines(out);
      const tree = treeOf(d);
      const nodes = allNodes(tree);
      nodes.forEach((node, i) => {
        const line = (printed[i] ?? '').trim().replace(/^(yes|no): /, '');
        if (node.split) {
          const name = names[node.split.feature === 'x' ? 0 : 1];
          expect(line.startsWith(`${name} ≤ `)).toBe(true);
          const [t, n, g] = numbers(line);
          expect(t).toBe(node.split.threshold);
          expect(n).toBe(node.rows.length);
          near(g, node.gain ?? NaN);
        } else {
          expect(line.startsWith(`${node.prediction} (`)).toBe(true);
          const [n, g] = numbers(line);
          expect(n).toBe(node.rows.length);
          near(g, node.gini);
        }
      });
      expect(printed[nodes.length]).toBe(
        `Right on its own data: ${rightCount(tree, d.rows)} of ${d.rows.length}`,
      );
      const [count, impurity] = numbers(printed[nodes.length + 1]);
      expect(count).toBe(leaves(tree).length);
      near(impurity, leafImpurity(tree));
    }
  });

  it.skipIf(!hasModule('sklearn'))(
    'scikit-learn: the best tree, when no question was moved',
    { timeout: 60_000 },
    () => {
      for (const d of cases.slice(0, 4)) {
        const { out, ok, error } = runPython(sklearnPython(d));
        expect(ok, error).toBe(true);
        const printed = lines(out);
        const tree = treeOf(d);
        const questions = allNodes(tree).filter((n) => n.split);
        // export_text prints each question twice (≤ and >), to 2 decimals.
        for (const node of questions) {
          const name = names[node.split?.feature === 'x' ? 0 : 1];
          expect(out).toContain(
            `${name} <= ${(node.split?.threshold ?? NaN).toFixed(2)}`,
          );
        }
        expect(printed.at(-2)).toBe(
          `Right on its own data: ${rightCount(tree, d.rows)} of ${d.rows.length}`,
        );
        const [count, impurity] = numbers(printed.at(-1));
        expect(count).toBe(leaves(tree).length);
        near(impurity, leafImpurity(tree));
      }
    },
  );
});

describe('the code text', () => {
  it('holds the depth and the questions moved by hand', () => {
    const code = plainPython(
      data(0, 3, {
        L: { feature: 'y', threshold: 12.5 },
        '': { feature: 'x', threshold: 24 },
      }),
    );
    expect(code).toContain('max_depth = 3');
    expect(code).toContain(
      'chosen = {"": ("temperature", 24), "L": ("wind", 12.5)}',
    );
    expect(code).toContain('(33, 29, "stay"),');
    expect(sklearnPython(data(0, 2))).not.toContain('moved questions');
    expect(
      sklearnPython(data(0, 2, { '': { feature: 'x', threshold: 24 } })),
    ).toContain('You moved questions by hand');
  });
});
