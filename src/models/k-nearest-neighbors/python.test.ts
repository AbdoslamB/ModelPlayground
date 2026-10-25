import { describe, expect, it } from 'vitest';

import type { PythonData } from './python';

import {
  hasModule,
  lines,
  python,
  runPython,
} from '../../../tests/unit/run-python';
import { datasets } from './data';
import { leaveOneOut, rankByDistance, vote } from './math';
import { plainPython, sklearnPython } from './python';

const dataset = datasets[0];
if (!dataset) throw new Error('no data');

function data(batch: number, k: number, query = dataset.start): PythonData {
  return {
    title: dataset.title,
    rows: dataset.batches[batch] ?? [],
    query,
    k,
  };
}

/** What the Lab shows, as the programs print it. */
function expected(d: PythonData) {
  const ranked = rankByDistance(d.rows, d.query);
  return {
    nearest: ranked
      .slice(0, d.k)
      .map(
        (r) => `${r.row.label} ${r.row.id}: ${r.distance.toFixed(2)} cm away`,
      ),
    winner: vote(ranked, d.k).winner,
    score: `Right on its own data: ${leaveOneOut(d.rows, d.k)} of ${d.rows.length}`,
  };
}

const cases = [
  data(0, 3),
  data(0, 1),
  data(1, 5, { x: 6.2, y: 9.1 }),
  data(2, 9, { x: 9, y: 7 }),
  data(3, 7),
  data(5, 3, { x: 5.5, y: 6 }),
];

describe('the Python versions print the Lab’s numbers', () => {
  it.skipIf(!python)('plain Python', () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(plainPython(d));
      expect(ok, error).toBe(true);
      const want = expected(d);
      const printed = lines(out);
      expect(printed.slice(0, d.k)).toEqual(want.nearest);
      expect(printed[d.k]).toMatch(new RegExp(`→ ${want.winner}$`));
      expect(printed[d.k + 1]).toBe(want.score);
    }
  });

  it.skipIf(!hasModule('sklearn'))('scikit-learn', { timeout: 60_000 }, () => {
    for (const d of cases.slice(0, 3)) {
      const { out, ok, error } = runPython(sklearnPython(d));
      expect(ok, error).toBe(true);
      const want = expected(d);
      const printed = lines(out);
      expect(printed.slice(0, d.k)).toEqual(want.nearest);
      expect(printed[d.k]).toBe(`The ${d.k} nearest vote: ${want.winner}`);
      expect(printed[d.k + 1]).toBe(want.score);
    }
  });
});

describe('the code text', () => {
  it('lists the fruits, the new fruit and k', () => {
    const code = plainPython(data(0, 5, { x: 7, y: 8.5 }));
    expect(code).toContain('(1, 7.5, 8.5, "apple"),');
    expect(code).toContain('new_fruit = (7, 8.5)');
    expect(code).toContain('k = 5');
    expect(sklearnPython(data(0, 3))).toContain('[7.5, 8.5],');
  });
});
