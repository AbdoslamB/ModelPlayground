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
import { greedyPath, qTable, train } from './math';
import { numpyPython, plainPython } from './python';

const dataset = datasets[0];
if (!dataset) throw new Error('no data');

function data(world: number, epsilon: number, steps: number): PythonData {
  return {
    title: dataset.title,
    world: dataset.worlds[world] ?? dataset.worlds[0],
    rewards: dataset.rewards,
    settings: dataset.settings,
    epsilon,
    steps,
  };
}

const cases = [
  data(0, 0.2, 3000),
  data(1, 0.1, 1500),
  data(2, 0.5, 600),
  data(0, 0.2, 7),
  data(0, 0.2, 0),
];

/** Printed to 2 decimals. */
function near(printed: number | undefined, value: number, unit = 0.01) {
  expect(Math.abs((printed ?? NaN) - value)).toBeLessThanOrEqual(
    unit / 2 + 1e-9,
  );
}

function check(out: string, d: PythonData) {
  const printed = lines(out);
  const t = train(d.world, d.rewards, d.settings, d.epsilon, d.steps);
  expect(printed[0]).toBe(
    `Trained ${d.steps} steps: ${t.episodes.length} episodes finished, the last ones scoring [${t.episodes.slice(-5).join(', ')}]`,
  );
  let at = 1;
  if (t.loss !== null) near(numbers(printed[at++]).at(-1), t.loss);
  const Q = qTable(t.net, d.world);
  const q = numbers(printed[at++]?.split('=')[1]);
  Q[d.world.start]?.forEach((value, a) => {
    near(q[a], value);
  });
  const path = greedyPath(d.world, d.rewards, Q);
  expect(printed[at]).toMatch(
    path.reached
      ? new RegExp(
          `^Best path from the start: ${path.cells.length - 1} steps: `,
        )
      : /none yet$/,
  );
}

describe('the Python versions train the Lab’s network', () => {
  it.skipIf(!python)(
    'plain Python: the Lab’s exact weights',
    { timeout: 120_000 },
    () => {
      for (const d of cases) {
        const { out, ok, error } = runPython(plainPython(d));
        expect(ok, error).toBe(true);
        check(out, d);
      }
    },
  );

  it.skipIf(!hasModule('numpy'))('NumPy', { timeout: 120_000 }, () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(numpyPython(d));
      expect(ok, error).toBe(true);
      check(out, d);
    }
  });
});

describe('the code text', () => {
  it('holds the field, ε and the steps', () => {
    const code = plainPython(data(1, 0.35, 1200));
    expect(code).toContain('epsilon = 0.35');
    expect(code).toContain('steps = 1200');
    expect(code).toContain('cats = [6, 13]');
    expect(numpyPython(data(0, 0.2, 1))).toContain(
      'h = np.maximum(W1 @ x + b1, 0)',
    );
  });
});
