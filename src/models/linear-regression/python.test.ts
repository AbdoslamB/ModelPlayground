import { describe, expect, it } from 'vitest';

import type { PythonData } from './python';

import {
  hasModule,
  numbers,
  python,
  runPython as run,
} from '../../../tests/unit/run-python';
import plants from './data/plants.json';
import { fit, mse, predict, sums } from './math';
import { plainPython, sklearnPython } from './python';

const rows = plants.batches[0] ?? [];
const data: PythonData = {
  x: 'age',
  y: 'height',
  xUnit: 'weeks',
  yUnit: 'cm',
  title: plants.title,
  xs: rows.map((r) => r.x),
  ys: rows.map((r) => r.y),
  exampleX: plants.exampleX,
};
const yours = { a: 20, b: 5.5 };
const s = sums(data.xs, data.ys);
const best = fit(s);
if (!best) throw new Error('no best line');

/** Rounded to 1 decimal by Python; allow for its rounding of ties. */
function near(printed: number | undefined, value: number) {
  expect(Math.abs((printed ?? NaN) - value)).toBeLessThanOrEqual(0.05 + 1e-9);
}

describe('the Python versions print the Lab’s numbers', () => {
  it.skipIf(!python)('plain Python: your line and the best line', () => {
    const { out, ok } = run(plainPython(data, yours));
    expect(ok).toBe(true);
    const [mine, top, misses, at] = out.trim().split('\n');
    const [a, b, e] = numbers(mine);
    near(a, yours.a);
    near(b, yours.b);
    near(e, mse(s, yours));
    const [ba, bb, be] = numbers(top);
    near(ba, best.a);
    near(bb, best.b);
    near(be, mse(s, best));
    const [miss, bmiss] = numbers(misses);
    near(miss, Math.sqrt(mse(s, yours)));
    near(bmiss, Math.sqrt(mse(s, best)));
    near(numbers(at)[1], predict(best, plants.exampleX));
  });

  const hasSklearn = hasModule('sklearn');

  it.skipIf(!hasSklearn)(
    'scikit-learn: the same best line',
    { timeout: 60_000 },
    () => {
      const { out, ok } = run(sklearnPython(data));
      expect(ok).toBe(true);
      const [top, misses, at] = out.trim().split('\n');
      const [ba, bb, be] = numbers(top);
      near(ba, best.a);
      near(bb, best.b);
      near(be, mse(s, best));
      near(numbers(misses)[0], Math.sqrt(mse(s, best)));
      near(numbers(at)[1], predict(best, plants.exampleX));
    },
  );
});

describe('the code text', () => {
  it('lists the data and the line as Python numbers', () => {
    const code = plainPython(
      { ...data, xs: [1.5, 2], ys: [-3, 4.25] },
      { a: -1, b: 0.5 },
    );
    expect(code).toContain('age = [1.5, 2]');
    expect(code).toContain('height = [-3, 4.25]');
    expect(code).toContain('a, b = -1, 0.5');
  });
});
