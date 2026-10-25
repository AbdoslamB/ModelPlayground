import { describe, expect, it } from 'vitest';

import type { Kernel, Point } from './math';
import type { PythonData } from './python';

import {
  hasModule,
  lines,
  numbers,
  python,
  runPython,
} from '../../../tests/unit/run-python';
import { datasets } from './data';
import {
  decide,
  marginWidth,
  objective,
  supportVectors,
  train,
  weights,
} from './math';
import { plainPython, sklearnPython } from './python';

const dataset = datasets[0];
if (!dataset) throw new Error('no data');
const sign = (label: string) =>
  dataset.classes.find((c) => c.id === label)?.sign ?? 1;

function data(
  batch: number,
  C: number,
  kernel: Kernel,
  moved: Record<number, Point> = {},
): PythonData {
  const rows = (dataset.batches[batch] ?? []).map((r) => ({
    ...r,
    ...moved[r.id],
  }));
  return {
    title: dataset.title,
    points: rows,
    signs: rows.map((r) => sign(r.label)),
    plus: 'passed',
    minus: 'failed',
    names: ['studied', 'slept'],
    C,
    kernel,
  };
}

const linear: Kernel = { type: 'linear' };
const cases = [
  data(0, 1, linear),
  data(1, 10 ** -1.5, linear),
  data(2, 100, linear),
  data(3, 10 ** 0.25, linear, { 4: { x: 9, y: 1.5 } }),
  data(0, 1, { type: 'rbf', gamma: 10 ** -0.5 }),
  data(4, 10, { type: 'rbf', gamma: 10 ** 0.75 }),
];

/** Printed to 2 decimals. */
function near(printed: number | undefined, value: number) {
  expect(Math.abs((printed ?? NaN) - value)).toBeLessThanOrEqual(0.005 + 1e-6);
}

/** Each line against the Lab's machine. */
function check(printed: string[], d: PythonData) {
  const machine = train(d.points, d.signs, d.C, d.kernel);
  const support = supportVectors(machine).map((i) => i + 1);
  expect(printed[0]).toBe(
    `Support vectors: ${support.length} of ${d.points.length}: students [${support.join(', ')}]`,
  );
  let at = 1;
  if (d.kernel.type === 'linear') {
    const w = weights(machine);
    const [w1, w2, b] = numbers(printed[at++]?.replace(/ ([+-])/g, ' $1'));
    near(w1, w.x);
    near(Math.abs(w2 ?? NaN), Math.abs(w.y));
    near(Math.abs(b ?? NaN), Math.abs(machine.b));
    const margin = numbers(printed[at++]).at(-1);
    near(margin, marginWidth(w));
    const o = objective(machine, d.C);
    near(numbers(printed[at++]).at(-1), o.total);
  } else {
    near(Math.abs(numbers(printed[at++]).at(-1) ?? NaN), Math.abs(machine.b));
  }
  const wrong = d.points.filter(
    (p, i) => (d.signs[i] ?? 1) * decide(machine, p) < 0,
  ).length;
  expect(printed[at]).toBe(
    `On the wrong side of the border: ${wrong} of ${d.points.length}`,
  );
}

describe('the Python versions print the Lab’s numbers', () => {
  it.skipIf(!python)('plain Python', { timeout: 60_000 }, () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(plainPython(d));
      expect(ok, error).toBe(true);
      check(lines(out), d);
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
  it('holds C and the kernel the Lab uses', () => {
    expect(plainPython(data(0, 0.1, linear))).toContain('C = 0.1');
    expect(plainPython(data(0, 1, linear))).toContain('return a[0] * b[0]');
    const curved = plainPython(data(0, 1, { type: 'rbf', gamma: 0.5 }));
    expect(curved).toContain('gamma = 0.5');
    expect(sklearnPython(data(0, 1, { type: 'rbf', gamma: 0.5 }))).toContain(
      'SVC(kernel="rbf", C=C, tol=1e-9, gamma=0.5)',
    );
  });
});
