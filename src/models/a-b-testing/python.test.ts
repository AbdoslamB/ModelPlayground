import { describe, expect, it } from 'vitest';

import type { PythonProgram } from '../../lib/python';
import type { DecideData, PlanData, TestData } from './python';

import {
  hasModule,
  lines,
  python,
  runPython,
} from '../../../tests/unit/run-python';
import { datasets } from './data';
import {
  ciCase,
  fade,
  money,
  normalQuantile,
  plannedDays,
  sampleSize,
  splitCheck,
  welch,
} from './math';
import {
  checkPrograms,
  decidePrograms,
  planPrograms,
  testPrograms,
} from './python';

const dataset = datasets[0];
if (!dataset) throw new Error('no data');
const perGroupPerDay = dataset.searchersPerDay / 2;

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

/** Runs one program and returns its printed lines. */
function run(program: PythonProgram | undefined): string[] {
  const { out, ok, error } = runPython(program?.code ?? '');
  expect(ok, error).toBe(true);
  return lines(out);
}

const scipy = hasModule('scipy');
/** The tabs this machine can run. */
function tabs(programs: PythonProgram[]): PythonProgram[] {
  return programs.filter((p) => p.id !== 'scipy' || scipy);
}

function test(index: number, day: number, alpha = 0.05): TestData {
  const t = dataset?.tests[index];
  if (!t) throw new Error('no test');
  return { title: t.title, days: t.days.slice(0, day), alpha };
}

describe.skipIf(!python)('step 3: plan the test', { timeout: 120_000 }, () => {
  const plans: PlanData[] = [
    { alpha: 0.05, power: 0.8, mde: 0.02, mean: 5, sd: 20, perGroupPerDay },
    { alpha: 0.01, power: 0.9, mde: 0.015, mean: 5, sd: 20, perGroupPerDay },
    { alpha: 0.1, power: 0.5, mde: 0.05, mean: 5, sd: 20, perGroupPerDay },
  ];
  it.each(plans)('α $alpha, power $power, MDE $mde', (d) => {
    for (const program of tabs(planPrograms(d))) {
      const printed = run(program);
      const [za, zb] = values(printed[0]);
      near(za, normalQuantile(1 - d.alpha / 2), 3);
      near(zb, normalQuantile(d.power), 3);
      near(values(printed[1])[0], d.mde * d.mean, 2);
      const n = sampleSize(d.alpha, d.power, d.mde, d.mean, d.sd);
      near(values(printed[2])[0], n, 0);
      const [traffic, days] = values(printed[3]);
      near(traffic, n / d.perGroupPerDay, 1);
      expect(days).toBe(plannedDays(n, d.perGroupPerDay));
    }
  });
});

describe.skipIf(!python)('step 5: check the data', { timeout: 120_000 }, () => {
  it.each([
    [1, 14],
    [4, 14],
    [5, 10],
    [1, 5],
  ])('test %i, %i days', (index, day) => {
    const d = test(index, day);
    const r = welch(d.days, 0.05);
    const split = splitCheck(r.nC, r.nT);
    for (const program of tabs(checkPrograms(d))) {
      const printed = run(program);
      expect(printed[0]).toBe(`${d.title}, days 1 to ${day}`);
      expect(values(printed[1])).toEqual([r.nC, r.nT]);
      near(values(printed[2])[0], split.chi2, 2);
      pNear(printed[2], split.p);
      expect(printed[2]?.includes('uneven')).toBe(split.p < 0.001);
      if (day < 8) {
        expect(printed[3]).toMatch(/^Week 2 has not started/);
      } else {
        const f = fade(d.days.slice(0, 7), d.days.slice(7));
        near(values(printed[3])[1], f.first * 100, 2);
        near(values(printed[4])[1], f.last * 100, 2);
        near(values(printed[5])[0], f.z, 2);
        pNear(printed[5], f.p);
      }
    }
  });
});

describe.skipIf(!python)(
  'step 6: test the difference',
  { timeout: 120_000 },
  () => {
    it.each([
      [0, 3, 0.05],
      [1, 14, 0.05],
      [2, 14, 0.1],
      [4, 14, 0.05],
      [5, 9, 0.01],
    ])('test %i, %i days, α %s', (index, day, alpha) => {
      const d = test(index, day, alpha);
      const r = welch(d.days, alpha);
      for (const program of tabs(testPrograms(d))) {
        const printed = run(program);
        expect(printed[0]).toBe(`${d.title}, days 1 to ${day}`);
        const [mC, mT] = values(printed[1]);
        near(mC, r.meanC, 4);
        near(mT, r.meanT, 4);
        const [diff, margin] = values(printed[2]);
        near(diff, r.diff, 4);
        near(margin, r.crit * r.se, 4);
        near(values(printed[3])[0], r.z, 2);
        pNear(printed[3], r.p);
        const [lift, , lo, hi] = values(printed[4]);
        near(lift, r.lift * 100, 2);
        near(lo, r.lo * 100, 2);
        near(hi, r.hi * 100, 2);
        if (program.id === 'scipy') {
          expect(printed[5]).toMatch(/^SciPy's Welch t-test: t = -?\d+\.\d\d/);
        }
      }
    });
  },
);

describe.skipIf(!python)('step 7: decide', { timeout: 120_000 }, () => {
  it.each([
    [1, 0.02, 4000],
    [2, 0.02, 0],
    [3, 0.02, 12000],
    [0, 0.005, 4000],
  ])('test %i, MDE %s, cost %s', (index, mde, cost) => {
    const r = welch(test(index, 14).days, 0.05);
    const d: DecideData = {
      lift: r.lift,
      lo: r.lo,
      hi: r.hi,
      meanC: r.meanC,
      mde,
      searchers: dataset.searchersPerDay,
      cost,
    };
    const [program] = decidePrograms(d);
    const printed = run(program);
    const [lo, hi] = values(printed[0]);
    near(lo, r.lo * 100, 2);
    near(hi, r.hi * 100, 2);
    const names = {
      borderline: 'Borderline',
      none: 'No useful effect',
      small: 'Real but too small',
      uncertain: 'Too uncertain',
      win: 'Clear win',
      worse: 'Worse',
    };
    expect(printed[1]).toMatch(
      new RegExp(`^${names[ciCase(r.lo, r.hi, mde)]}:`),
    );
    const m = money(r, dataset.searchersPerDay, cost);
    const [, expected, cautious] = values(printed[3]);
    near(expected, m.expected, 0);
    near(cautious, m.cautious, 0);
    near(values(printed[4])[0], m.breakEven * 100, 2);
  });
});

describe('the code text', () => {
  it('holds the Lab’s numbers', () => {
    const d = test(1, 3);
    expect(checkPrograms(d)[1]?.code).toContain(
      `n_c = [${d.days.map((x) => x.control.n).join(', ')}]`,
    );
    expect(
      planPrograms({
        alpha: 0.05,
        power: 0.8,
        mde: 0.02,
        mean: 5,
        sd: 20,
        perGroupPerDay,
      })[0]?.code,
    ).toContain('alpha, power, mde = 0.05, 0.8, 0.02');
    expect(testPrograms(d)[0]?.code).toContain('from scipy import stats');
  });
});
