import { describe, expect, it } from 'vitest';

import type { PythonData } from './python';

import {
  hasModule,
  lines,
  python,
  runPython,
} from '../../../tests/unit/run-python';
import { datasets } from './data';
import { plannedDays, sampleSize, splitCheck, welch } from './math';
import { plainPython, scipyPython } from './python';

const dataset = datasets[0];
if (!dataset) throw new Error('no data');

function data(
  test: number,
  day: number,
  plan = { alpha: 0.05, power: 0.8, mde: 0.02 },
): PythonData {
  const t = dataset?.tests[test];
  if (!dataset || !t) throw new Error('no test');
  return {
    title: t.title,
    days: t.days.slice(0, day),
    ...plan,
    mean: dataset.history.mean,
    sd: dataset.history.sd,
    perGroupPerDay: dataset.searchersPerDay / 2,
  };
}

const cases = [
  data(0, 14),
  data(0, 3),
  data(1, 14, { alpha: 0.1, power: 0.9, mde: 0.03 }),
  data(4, 14),
  data(5, 9, { alpha: 0.01, power: 0.8, mde: 0.015 }),
];

/** Every number in a line, reading "699,504" as one number. */
function values(line: string | undefined): number[] {
  return (line?.match(/[-+]?\d[\d,]*(\.\d+)?/g) ?? []).map((s) =>
    Number(s.replaceAll(',', '')),
  );
}

function near(printed: number | undefined, value: number, decimals: number) {
  expect(Math.abs((printed ?? NaN) - value)).toBeLessThanOrEqual(
    0.5 * 10 ** -decimals + 1e-9,
  );
}

function pNear(line: string | undefined, p: number) {
  if (p < 0.0001) expect(line).toContain('p < 0.0001');
  else near(values(line?.split('p = ')[1])[0], p, 4);
}

function check(out: string, d: PythonData, scipy: boolean) {
  const printed = lines(out);
  const r = welch(d.days, d.alpha);
  const split = splitCheck(r.nC, r.nT);
  expect(printed[0]).toBe(`${d.title}, days 1 to ${d.days.length}`);
  expect(values(printed[1])).toEqual([r.nC, r.nT]);
  near(values(printed[2])[0], split.chi2, 2);
  pNear(printed[2], split.p);
  expect(printed[2]?.includes('uneven')).toBe(split.p < 0.001);
  const [mC, mT] = values(printed[3]);
  near(mC, r.meanC, 4);
  near(mT, r.meanT, 4);
  const [diff, margin] = values(printed[4]);
  near(diff, r.diff, 4);
  near(margin, r.crit * r.se, 4);
  near(values(printed[5])[0], r.z, 2);
  pNear(printed[5], r.p);
  const [lift, , lo, hi] = values(printed[6]);
  near(lift, r.lift * 100, 2);
  near(lo, r.lo * 100, 2);
  near(hi, r.hi * 100, 2);
  let at = 7;
  if (scipy) {
    expect(printed[at++]).toMatch(/^SciPy's Welch t-test: t = -?\d+\.\d\d, p/);
  }
  const n = sampleSize(d.alpha, d.power, d.mde, d.mean, d.sd);
  const [users, traffic, planned] = values(printed[at++]);
  near(users, n, 0);
  near(traffic, n / d.perGroupPerDay, 1);
  expect(planned).toBe(plannedDays(n, d.perGroupPerDay));
  expect(printed[at]).toMatch(/^CI case against the [\d.]+% MDE: /);
}

describe('the Python versions print the Lab’s numbers', () => {
  it.skipIf(!python)('plain Python', { timeout: 60_000 }, () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(plainPython(d));
      expect(ok, error).toBe(true);
      check(out, d, false);
    }
  });

  it.skipIf(!hasModule('scipy'))('SciPy', { timeout: 120_000 }, () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(scipyPython(d));
      expect(ok, error).toBe(true);
      check(out, d, true);
    }
  });
});

describe('the code text', () => {
  it('holds the days so far and the plan', () => {
    const d = data(0, 3);
    const code = plainPython(d);
    expect(code).toContain('alpha, power, mde = 0.05, 0.8, 0.02');
    expect(code).toContain(
      `n_c = [${d.days.map((x) => x.control.n).join(', ')}]`,
    );
    expect(scipyPython(d)).toContain('from scipy import stats');
  });
});
