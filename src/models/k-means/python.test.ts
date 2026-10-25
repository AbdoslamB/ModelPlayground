import { describe, expect, it } from 'vitest';

import type { Point } from './math';
import type { PythonData } from './python';

import {
  hasModule,
  lines,
  numbers,
  python,
  runPython,
} from '../../../tests/unit/run-python';
import { datasets } from './data';
import { assign, inertia, run } from './math';
import { plainPython, sklearnPython } from './python';

const dataset = datasets[0];
if (!dataset) throw new Error('no data');

function data(batch: number, stands: readonly Point[]): PythonData {
  return {
    title: dataset.title,
    people: dataset.batches[batch] ?? [],
    stands,
  };
}

const starts = (k: number) => dataset.starts.slice(0, k);

const cases = [
  data(0, starts(3)),
  data(1, starts(2)),
  data(2, starts(4)),
  data(4, [
    { x: 10, y: 90 },
    { x: 80, y: 20.5 },
    { x: 50, y: 50 },
  ]),
];

/** Printed to 1 decimal (J to 0); allow for rounding either way. */
function near(printed: number | undefined, value: number, unit = 0.1) {
  expect(Math.abs((printed ?? NaN) - value)).toBeLessThanOrEqual(
    unit / 2 + 1e-9,
  );
}

/** The final stands, J and typical walk, as the Lab shows them after Run. */
function check(printed: string[], d: PythonData) {
  const done = run(d.people, d.stands);
  const J = inertia(d.people, done.labels, done.centres);
  done.centres.forEach((centre, i) => {
    const [east, north] = numbers(printed[i]?.replace(/^Stand \w: /, ''));
    near(east, centre.x);
    near(north, centre.y);
  });
  const [j, walk] = numbers(printed[d.stands.length]);
  near(j, J, 1);
  near(walk, Math.sqrt(J / d.people.length));
}

describe('the Python versions print the Lab’s numbers', () => {
  it.skipIf(!python)('plain Python', () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(plainPython(d));
      expect(ok, error).toBe(true);
      const printed = lines(out);
      const nowJ = inertia(d.people, assign(d.people, d.stands), d.stands);
      near(numbers(printed[0])[0], nowJ, 1);
      expect(printed[1]).toBe(
        `Settled after ${run(d.people, d.stands).steps} steps`,
      );
      check(printed.slice(2), d);
    }
  });

  it.skipIf(!hasModule('sklearn'))('scikit-learn', { timeout: 60_000 }, () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(sklearnPython(d));
      expect(ok, error).toBe(true);
      check(lines(out), d);
    }
  });
});

describe('the code text', () => {
  it('lists the people and the Lab’s stands', () => {
    const d = data(0, [
      { x: 42, y: 44.5 },
      { x: 58, y: 56 },
    ]);
    expect(plainPython(d)).toContain('stands = [(42, 44.5), (58, 56)]');
    expect(sklearnPython(d)).toContain(
      'stands = np.array([[42, 44.5], [58, 56]])',
    );
    expect(plainPython(d)).toContain('    (21.4, 58.8),');
  });
});
