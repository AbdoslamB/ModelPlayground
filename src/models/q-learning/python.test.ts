import { describe, expect, it } from 'vitest';

import type { World } from './math';
import type { PythonData } from './python';

import {
  hasModule,
  lines,
  numbers,
  python,
  runPython,
} from '../../../tests/unit/run-python';
import { datasets } from './data';
import { greedyPath, train } from './math';
import { numpyPython, plainPython } from './python';

const dataset = datasets[0];
if (!dataset) throw new Error('no data');

function data(
  maze: number,
  episodes: number,
  params = { alpha: 0.5, gamma: 0.9, epsilon: 0.1 },
  edit: Partial<World> = {},
): PythonData {
  const world = { ...(dataset.mazes[maze] ?? dataset.mazes[0]), ...edit };
  const steps = train(
    world,
    dataset.rewards,
    params,
    dataset.seed,
    dataset.maxEpisodeSteps,
    { episodes },
  ).steps;
  return {
    title: dataset.title,
    world,
    rewards: dataset.rewards,
    params,
    seed: dataset.seed,
    maxEpisodeSteps: dataset.maxEpisodeSteps,
    steps,
  };
}

const cases = [
  data(0, 15),
  data(0, 0),
  data(1, 200, { alpha: 0.3, gamma: 0.95, epsilon: 0.2 }),
  data(2, 40, { alpha: 1, gamma: 0.5, epsilon: 0 }),
  data(3, 60, { alpha: 0.5, gamma: 0.9, epsilon: 0.1 }, { cats: [] }),
];

/** Printed to 2 decimals. */
function near(printed: number | undefined, value: number) {
  expect(Math.abs((printed ?? NaN) - value)).toBeLessThanOrEqual(0.005 + 1e-9);
}

function check(out: string, d: PythonData) {
  const printed = lines(out);
  const t = train(d.world, d.rewards, d.params, d.seed, d.maxEpisodeSteps, {
    steps: d.steps,
  });
  expect(printed[0]).toBe(
    `Trained ${d.steps} steps: ${t.episode} episodes finished`,
  );
  let at = 1;
  if (t.last) {
    // before, α, r, γ, future, before again, after
    const [before, , , , future, , after] = numbers(
      printed[at++]?.replace(/^Last update: Q\(\w+/, ''),
    );
    near(before, t.last.before);
    near(future, t.last.future);
    near(after, t.last.after);
  }
  const q = numbers(printed[at++]?.split('=')[1]);
  t.Q[d.world.start]?.forEach((value, a) => {
    near(q[a], value);
  });
  const path = greedyPath(d.world, d.rewards, t.Q);
  expect(printed[at]).toBe(
    path.reached
      ? `Best path from the start: ${path.cells.length - 1} steps: ${path.cells
          .map(
            (c) =>
              `${'ABCDEFGHIJ'[c % d.world.columns]}${Math.floor(c / d.world.columns) + 1}`,
          )
          .join(' → ')}`
      : 'Best path from the start: none yet',
  );
}

describe('the Python versions replay the Lab’s training', () => {
  it.skipIf(!python)('plain Python', { timeout: 60_000 }, () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(plainPython(d));
      expect(ok, error).toBe(true);
      check(out, d);
    }
  });

  it.skipIf(!hasModule('numpy'))('NumPy', { timeout: 60_000 }, () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(numpyPython(d));
      expect(ok, error).toBe(true);
      check(out, d);
    }
  });
});

describe('the code text', () => {
  it('holds the maze, the settings and the steps', () => {
    const d = data(0, 15, { alpha: 0.25, gamma: 0.9, epsilon: 0.05 });
    const code = plainPython(d);
    expect(code).toContain('alpha, gamma, epsilon = 0.25, 0.9, 0.05');
    expect(code).toContain(`steps = ${d.steps}`);
    expect(code).toContain('walls = [3, 7, 9, 13, 26]');
    expect(numpyPython(d)).toContain('Q = np.zeros((columns * rows, 4))');
  });
});
