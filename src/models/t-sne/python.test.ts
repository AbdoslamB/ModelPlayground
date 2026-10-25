import { describe, expect, it } from 'vitest';

import type { PythonData } from './python';

import {
  hasModule,
  lines,
  numbers,
  runPython,
} from '../../../tests/unit/run-python';
import { datasets } from './data';
import {
  advance,
  conditionalP,
  jointP,
  kept,
  klDivergence,
  mapDistances,
  nearest,
  squaredDistances,
  startRun,
} from './math';
import { numpyPython, sklearnPython } from './python';

const dataset = datasets[0];
if (!dataset) throw new Error('no data');
const kindNames = Object.fromEntries(dataset.kinds.map((k) => [k.id, k.name]));

function data(
  batch: number,
  perplexity: number,
  steps: number,
  reference = 0,
): PythonData {
  const pictures = dataset.batches[batch] ?? [];
  return {
    title: dataset.title,
    pictures,
    kindNames,
    start: pictures.map((p) => p.start),
    perplexity,
    steps,
    schedule: dataset.schedule,
    neighbours: dataset.neighbours,
    reference,
  };
}

/** What the Lab shows for these settings. */
function lab(d: PythonData) {
  const D = squaredDistances(d.pictures.map((p) => p.pixels));
  const P = jointP(D, d.perplexity);
  const run = advance(startRun(d.start), P, d.schedule, d.steps);
  const dataNearest = nearest(D, d.neighbours);
  const mapNearest = nearest(mapDistances(run.Y), d.neighbours);
  const beta = conditionalP(D, d.perplexity).beta[d.reference] ?? NaN;
  return {
    cost: klDivergence(run.Y, P).cost,
    sigma: Math.sqrt(1 / (2 * beta)),
    kept: kept(dataNearest, mapNearest).reduce((t, v) => t + v, 0),
    near: (dataNearest[d.reference] ?? []).map((j) => j + 1),
    still: (dataNearest[d.reference] ?? []).filter((j) =>
      mapNearest[d.reference]?.includes(j),
    ).length,
  };
}

// While the map is a tiny cloud (up to about step 260) the cost is the
// Lab's to the last digit; after that, rounding differences grow. Which
// pictures are nearest on such a tiny map can flip on the last digit, so
// neighbour counts are exact only at the start.
const exact = [data(0, 8, 0), data(0, 8, 260), data(1, 3, 250, 7)];
const late = [data(0, 8, 1000), data(2, 20, 600, 39)];
const cases = [...exact, ...late];

describe('the Python versions print the Lab’s numbers', () => {
  it.skipIf(!hasModule('numpy'))(
    'by hand with NumPy: the Lab’s exact run',
    { timeout: 120_000 },
    () => {
      for (const d of cases) {
        const { out, ok, error } = runPython(numpyPython(d));
        expect(ok, error).toBe(true);
        const [cost, sigma, keptLine, picture] = lines(out);
        const want = lab(d);
        const printedCost = numbers(cost?.split('=').at(-1))[0] ?? NaN;
        expect(numbers(sigma).at(-1)).toBe(Number(want.sigma.toFixed(1)));
        expect(picture).toContain(`are [${want.near.join(', ')}];`);
        if (exact.includes(d)) {
          expect(printedCost).toBe(Number(want.cost.toFixed(3)));
        } else {
          expect(Math.abs(printedCost - want.cost)).toBeLessThan(
            0.25 * want.cost,
          );
        }
        if (d.steps === 0) {
          expect(numbers(keptLine)[0]).toBe(want.kept);
          expect(picture).toContain(`; ${want.still} of them`);
        } else {
          expect(
            Math.abs((numbers(keptLine)[0] ?? NaN) - want.kept),
          ).toBeLessThanOrEqual(0.1 * d.pictures.length * d.neighbours);
        }
      }
    },
  );

  it.skipIf(!hasModule('sklearn'))(
    'scikit-learn: its own run, from the same start',
    { timeout: 120_000 },
    () => {
      const d = late[0];
      if (!d) return;
      const { out, ok, error } = runPython(sklearnPython(d));
      expect(ok, error).toBe(true);
      const [cost, keptLine] = lines(out);
      const want = lab(d);
      // Close to the Lab's cost, and most neighbours kept, as in the Lab.
      expect(
        Math.abs((numbers(cost?.split('=').at(-1))[0] ?? NaN) - want.cost),
      ).toBeLessThan(0.1);
      expect(numbers(keptLine)[0]).toBeGreaterThan(want.kept * 0.8);
    },
  );
});

describe('the code text', () => {
  it('holds the pictures, the start, the perplexity and the steps', () => {
    const code = numpyPython(data(0, 12, 300));
    expect(code).toContain('perplexity = 12');
    expect(code).toContain('steps = 300');
    expect(code).toContain('# 1: bar across');
    expect(code).toContain('[-0.000016081, -0.000005337],');
    expect(sklearnPython(data(0, 12, 100))).toContain('max_iter=250');
  });
});
