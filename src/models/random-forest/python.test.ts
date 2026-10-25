import { describe, expect, it } from 'vitest';

import type { PythonData } from './python';

import {
  hasModule,
  lines,
  numbers,
  python,
  runPython,
} from '../../../tests/unit/run-python';
import { datasets } from './data';
import { coverage, leafFor, makeForest, outOfBag, tally } from './math';
import { plainPython, sklearnPython } from './python';

const dataset = datasets[0];
if (!dataset) throw new Error('no data');
const classes = dataset.classes.map((c) => c.id);

function data(
  batch: number,
  size: number,
  forestSeed: number,
  query = dataset.start,
): PythonData {
  return {
    title: dataset.title,
    rows: dataset.batches[batch] ?? [],
    classes,
    names: ['soil temperature', 'water'],
    units: ['°C', 'ml/day'],
    query,
    size,
    forestSeed,
    maxDepth: dataset.maxDepth,
  };
}

const cases = [
  data(0, 9, 1),
  data(1, 1, 2),
  data(2, 25, 7, { x: 20.5, y: 12 }),
  data(3, 5, 3, { x: 9, y: 35.5 }),
];

describe('the Python versions print the Lab’s votes', () => {
  it.skipIf(!python)('plain Python: the Lab’s exact trees', () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(plainPython(d));
      expect(ok, error).toBe(true);
      const printed = lines(out);
      const trees = makeForest(
        d.rows,
        classes,
        d.maxDepth,
        dataset.axes,
        d.forestSeed,
        d.size,
      );
      trees.forEach((tree, i) => {
        const vote = leafFor(tree.root, d.query).prediction;
        const seen = coverage(tree, d.rows.length).seen;
        expect(printed[i]).toBe(
          `Tree ${tree.id} saw ${seen} different seeds and says ${vote}`,
        );
      });
      const t = tally(trees, classes, d.query);
      const counts = classes.map((c, i) => `${t.counts[i]} ${c}`).join(', ');
      expect(printed[d.size]).toBe(
        `T = ${d.size} trees: ${counts} → ${t.winner}`,
      );
      const oob = outOfBag(d.rows, trees, classes);
      expect(printed[d.size + 1]).toBe(
        `Right on unseen seeds: ${oob.right} of ${oob.judged}`,
      );
    }
  });

  it.skipIf(!hasModule('sklearn'))(
    'scikit-learn: its own forest votes',
    { timeout: 60_000 },
    () => {
      for (const d of cases.slice(0, 2)) {
        const { out, ok, error } = runPython(sklearnPython(d));
        expect(ok, error).toBe(true);
        const [line] = lines(out);
        const votes = numbers(line?.split(':')[1]);
        expect(votes.reduce((a, b) => a + b, 0)).toBe(d.size);
        expect(line).toMatch(/→ (dry|sprout)$/);
      }
    },
  );
});

describe('the code text', () => {
  it('holds the forest number, the tree count and the new seed', () => {
    const code = plainPython(data(0, 7, 4, { x: 12.5, y: 30 }));
    expect(code).toContain('forest = 4');
    expect(code).toContain('T = 7');
    expect(code).toContain('new_seed = (12.5, 30)');
    expect(sklearnPython(data(0, 7, 4))).toContain('random_state=4');
  });
});
