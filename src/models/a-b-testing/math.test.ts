import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Day, DecideInput, Result } from './math';

import fixtures from '../../../tests/fixtures/a-b-testing.json';
import data from './data/tests.json';
import {
  aaRuns,
  ciCase,
  decide,
  designSe,
  dollars,
  erfc,
  fade,
  guardrails,
  mdeText,
  money,
  normalCdf,
  normalQuantile,
  percent,
  plannedDays,
  pText,
  pValue,
  sampleSize,
  share,
  signed,
  splitCheck,
  twoSided,
  welch,
  welchTotals,
} from './math';

/** Relative closeness, for numbers of any size. */
function close(actual: number, expected: number, rel = 1e-10) {
  const scale = Math.max(Math.abs(expected), 1e-300);
  expect(
    Math.abs(actual - expected) / scale,
    `${actual} vs ${expected}`,
  ).toBeLessThanOrEqual(rel);
}

const tests = data.tests as { id: string; days: Day[] }[];
const scenarios = fixtures.scenarios as Record<
  string,
  {
    days: Record<string, number>[];
    alpha10: Record<string, number>[];
    case: string;
    fade: Record<string, number>;
  }
>;
const perGroupPerDay = data.searchersPerDay / 2;

describe('the normal distribution', () => {
  it.each(Object.entries(fixtures.quantiles))(
    'the quantile at %s matches SciPy',
    (p, z) => {
      if (z === 0)
        expect(Math.abs(normalQuantile(Number(p)))).toBeLessThan(1e-15);
      else close(normalQuantile(Number(p)), z, 1e-13);
    },
  );

  it.each(Object.entries(fixtures.tails))(
    'the two-sided p-value of z = %s matches SciPy',
    (z, p) => {
      close(twoSided(Number(z)), p, 1e-11);
    },
  );

  it('erfc is symmetric and its CDF runs from 0 to 1', () => {
    expect(erfc(0)).toBe(1);
    close(erfc(-1.3) + erfc(1.3), 2, 1e-15);
    expect(normalCdf(-40)).toBe(0);
    expect(normalCdf(40)).toBe(1);
    expect(Number.isNaN(erfc(NaN))).toBe(true);
  });

  it('the quantile undoes the CDF, and its ends are infinite', () => {
    fc.assert(
      // Beyond |z| ≈ 5 the CDF is too close to 0 or 1 to invert to 1e-9.
      fc.property(fc.double({ min: -5, max: 5, noNaN: true }), (z) => {
        expect(Math.abs(normalQuantile(normalCdf(z)) - z)).toBeLessThan(1e-9);
      }),
    );
    expect(normalQuantile(0)).toBe(-Infinity);
    expect(normalQuantile(1)).toBe(Infinity);
  });
});

describe.each(tests)('$id matches SciPy on every day', ({ id, days }) => {
  const expected = scenarios[id];
  if (!expected) throw new Error(`missing fixture for ${id}`);

  it.each(days.map((d) => d.day))('day %i, α = 0.05 and 0.10', (day) => {
    for (const [alpha, list] of [
      [0.05, expected.days],
      [0.1, expected.alpha10],
    ] as const) {
      const ref = list[day - 1];
      if (!ref) throw new Error('missing day');
      const ours = welch(days.slice(0, day), alpha);
      expect(ours.nC).toBe(ref.nC);
      expect(ours.nT).toBe(ref.nT);
      for (const key of [
        'meanC',
        'meanT',
        'sdC',
        'sdT',
        'diff',
        'se',
        'z',
      ] as const) {
        close(ours[key], ref[key] ?? NaN, 1e-11);
      }
      close(ours.p, ref.p ?? NaN, 1e-9);
      close(ours.lo, ref.lo ?? NaN, 1e-10);
      close(ours.hi, ref.hi ?? NaN, 1e-10);
      const split = splitCheck(ours.nC, ours.nT);
      close(split.chi2, ref.chi2 ?? NaN, 1e-10);
      if ((ref.splitP ?? 0) > 1e-300) close(split.p, ref.splitP ?? NaN, 1e-9);
      else expect(split.p).toBeLessThan(1e-300);
      // SciPy's Welch t-test (t, not z) agrees to about 3 digits or better.
      if ((ref.welchP ?? 0) > 1e-300) close(ours.p, ref.welchP ?? NaN, 2e-3);
    }
  });

  it('lands in its case on day 14, and the fade test agrees', () => {
    const full = welch(days, 0.05);
    expect(ciCase(full.lo, full.hi, 0.02)).toBe(expected.case);
    const f = fade(days.slice(0, 7), days.slice(7));
    close(f.first, expected.fade.first ?? NaN, 1e-10);
    close(f.last, expected.fade.last ?? NaN, 1e-10);
    close(f.p, expected.fade.p ?? NaN, 1e-8);
  });
});

describe('planning', () => {
  it.each(fixtures.sampleSizes)(
    'α $alpha, power $power, MDE $mde: n and days match SciPy',
    ({ alpha, power, mde, n, days }) => {
      const ours = sampleSize(
        alpha,
        power,
        mde,
        data.history.mean,
        data.history.sd,
      );
      close(ours, n, 1e-12);
      expect(plannedDays(ours, perGroupPerDay)).toBe(days);
    },
  );

  it('the default plan: 627,910 users per group, 14 days', () => {
    const n = sampleSize(0.05, 0.8, 0.02, 5, 20);
    expect(Math.round(n)).toBe(627910);
    expect(plannedDays(n, 50000)).toBe(14);
    expect(plannedDays(1, 50000)).toBe(7);
  });
});

describe('the verdict', () => {
  const scenario = (id: string) => {
    const t = tests.find((s) => s.id === id);
    if (!t) throw new Error(id);
    return t.days;
  };

  function input(
    id: string,
    day: number,
    extra: Partial<DecideInput> = {},
  ): DecideInput {
    const days = scenario(id).slice(0, day);
    const result = welch(days, 0.05);
    return {
      day,
      planned: 14,
      lastDay: 14,
      alpha: 0.05,
      mde: 0.02,
      result,
      split: splitCheck(result.nC, result.nT),
      splitLimit: data.splitLimit,
      guard: guardrails(days, data.limits),
      fade: day >= 14 ? fade(days.slice(0, 7), days.slice(7)) : null,
      ...extra,
    };
  }

  it.each([
    ['aa', 'none'],
    ['win', 'win'],
    ['modest', 'borderline'],
    ['holiday', 'uncertain'],
    ['bug', 'invalid'],
    ['novelty', 'faded'],
  ])('%s ends with "%s"', (id, kind) => {
    expect(decide(input(id, 14)).kind).toBe(kind);
  });

  it('the A/A test looks like a win on day 3: the peeking trap', () => {
    const v = decide(input('aa', 3));
    expect(v.kind).toBe('early');
    expect(v.title).toBe('Too early: day 3 of 14');
    expect(v.detail).toMatch(
      /^Stopping now would look like a \+\d\.\d% win \(p = 0\.0\d+\)\.$/,
    );
  });

  it('when the plan is longer than the data, it says so', () => {
    const v = decide(input('win', 14, { planned: 56 }));
    expect(v.title).toBe('Too early: the plan needs 56 days');
  });

  it('a broken guardrail stops a launch, after the split check', () => {
    const guard = { latency: 15, errors: 0, latencyOk: false, errorsOk: true };
    expect(decide(input('win', 14, { guard })).detail).toBe(
      'Search got 15 ms slower.',
    );
    expect(decide(input('bug', 14, { guard })).kind).toBe('invalid');
  });

  it('a clear win that costs too much is not launched', () => {
    const base = input('win', 14);
    const cheap = money(base.result, data.searchersPerDay, 4000);
    const dear = money(base.result, data.searchersPerDay, 20000);
    expect(decide({ ...base, money: cheap, cost: 4000 }).kind).toBe('win');
    const v = decide({ ...base, money: dear, cost: 20000 });
    expect(v.kind).toBe('costly');
    expect(v.detail).toMatch(
      /^At \$20,000 a day, the cautious gain is −\$[\d,]+ a day\.$/,
    );
  });

  const r = (lo: number, hi: number): Result => ({
    nC: 1000,
    nT: 1000,
    meanC: 5,
    meanT: 5,
    sdC: 1,
    sdT: 1,
    diff: 0,
    se: 1,
    z: 0,
    p: 0.5,
    crit: 1.96,
    lift: (lo + hi) / 2,
    lo,
    hi,
  });
  it.each([
    [0.03, 0.05, 'win', 'good'],
    [0.01, 0.03, 'borderline', 'warn'],
    [0.005, 0.015, 'small', 'bad'],
    [-0.01, 0.03, 'uncertain', 'warn'],
    [-0.01, 0.01, 'none', 'bad'],
    [-0.03, -0.01, 'worse', 'bad'],
  ])('CI [%s, %s] → %s (%s)', (lo, hi, kind, tone) => {
    const v = decide({ ...input('aa', 14), result: r(lo, hi), fade: null });
    expect(v.kind).toBe(kind);
    expect(v.tone).toBe(tone);
  });
});

describe('guardrails, money and text', () => {
  it('the tracking bug slows search; the others stay within the limits', () => {
    for (const t of tests) {
      const g = guardrails(t.days, data.limits);
      expect(g.latencyOk, t.id).toBe(t.id !== 'bug');
      expect(g.errorsOk, t.id).toBe(true);
    }
  });

  it('money: expected and cautious net per day, and the break-even lift', () => {
    const m = money(
      { ...welch(tests[1]?.days ?? [], 0.05), diff: 0.2, lo: 0.02, meanC: 5 },
      100000,
      4000,
    );
    close(m.expected, 16000);
    close(m.cautious, 6000);
    close(m.breakEven, 0.008);
  });

  it('formats lifts, p-values, the MDE and dollars', () => {
    expect(percent(0.0357)).toBe('+3.6%');
    expect(percent(-0.0014)).toBe('−0.1%');
    expect(percent(0.0004)).toBe('0.0%');
    expect(pText(0.0262)).toBe('p = 0.026');
    expect(pText(0.0012)).toBe('p = 0.0012');
    expect(pText(1e-9)).toBe('p < 0.0001');
    expect(mdeText(0.02)).toBe('2%');
    expect(mdeText(0.025)).toBe('2.5%');
    expect(mdeText(0.005)).toBe('0.5%');
    expect(dollars(-1250.4)).toBe('−$1,250');
    expect(dollars(4000)).toBe('$4,000');
  });
});

describe('every branch of the verdict and the text', () => {
  const days = (data.tests[1]?.days ?? []) as Day[];
  const base = (day: number): DecideInput => {
    const result = welch(days.slice(0, day), 0.05);
    return {
      day,
      planned: 14,
      lastDay: 14,
      alpha: 0.05,
      mde: 0.02,
      result,
      split: splitCheck(result.nC, result.nT),
      splitLimit: data.splitLimit,
      guard: guardrails(days.slice(0, day), data.limits),
      fade: null,
    };
  };

  it('too early: a loss, or no clear difference yet', () => {
    const loss = base(3);
    loss.result = { ...loss.result, diff: -0.1, lift: -0.02, p: 0.01 };
    expect(decide(loss).detail).toMatch(
      /look like a −2\.0% loss \(p = 0\.010\)/,
    );
    const unclear = base(3);
    unclear.result = { ...unclear.result, p: 0.4 };
    expect(decide(unclear).detail).toMatch(
      /^So far \+\d\.\d% \(p = 0\.400\): no clear difference yet\.$/,
    );
  });

  it('a checkout-error guardrail, and a costly win without a stated cost', () => {
    const guard = { latency: 2, errors: 0.3, latencyOk: true, errorsOk: false };
    expect(decide({ ...base(14), guard }).detail).toBe(
      'Checkout errors rose by 0.30 points.',
    );
    const r = base(14).result;
    const v = decide({ ...base(14), money: money(r, 100000, 1e9) });
    expect(v.detail).toMatch(/^At \$0 a day, the cautious gain is −\$/);
  });

  it('formats changes, shares and tiny p-values, and the design SE', () => {
    expect(signed(4.1, 0)).toBe('+4');
    expect(signed(-0.023, 2)).toBe('−0.02');
    expect(signed(0.001, 2)).toBe('0.00');
    expect(share(0.2121)).toBe('21.2%');
    expect(share(0.05, 0)).toBe('5%');
    expect(pValue(1e-9)).toBe('< 0.0001');
    expect(pValue(0.026)).toBe('0.026');
    // 20 × √(2 / 50,000) / 5 = 0.0253 after one day; it shrinks as 1/√days.
    close(designSe(1, 50000, 5, 20), 0.0252982212813, 1e-9);
    close(designSe(4, 50000, 5, 20), designSe(1, 50000, 5, 20) / 2, 1e-12);
  });
});

describe('the six cases of step 7', () => {
  it.each(data.cases)(
    '$name: its simulated test lands in its own case, as in SciPy',
    (c) => {
      const r = welchTotals(c.control, c.treatment, 0.05);
      expect(ciCase(r.lo, r.hi, 0.02)).toBe(c.id);
      const ref = (fixtures.cases as Record<string, Record<string, number>>)[
        c.id
      ];
      close(r.lift, ref?.lift ?? NaN, 1e-10);
      close(r.lo, ref?.lo ?? NaN, 1e-10);
      close(r.hi, ref?.hi ?? NaN, 1e-10);
    },
  );

  it('covers every case once', () => {
    expect(data.cases.map((c) => c.id).sort()).toEqual(
      ['borderline', 'none', 'small', 'uncertain', 'win', 'worse'].sort(),
    );
  });
});

describe('many A/A tests', () => {
  it('match the Python run: about 21% cross on some day, 5% on the last', () => {
    const ref = fixtures.aaRuns;
    const ours = aaRuns(data.aa.seed, ref.tests, 14, normalQuantile(0.975), 1);
    expect(ours.ever).toBe(ref.ever);
    expect(ours.end).toBe(ref.end);
    ours.paths[0]?.forEach((z, i) => {
      close(z, ref.firstPath[i] ?? NaN, 1e-12);
    });
  });
});

describe('properties', () => {
  const days = tests[0]?.days ?? [];

  it('p is in [0, 1], and the CI holds the lift', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 14 }),
        fc.double({ min: 0.01, max: 0.2, noNaN: true }),
        (day, alpha) => {
          const w = welch(days.slice(0, day), alpha);
          expect(w.p).toBeGreaterThanOrEqual(0);
          expect(w.p).toBeLessThanOrEqual(1);
          expect(w.lo).toBeLessThanOrEqual(w.lift);
          expect(w.hi).toBeGreaterThanOrEqual(w.lift);
        },
      ),
    );
  });

  it('swapping the groups flips z and keeps p', () => {
    const swapped = days.map((d) => ({
      ...d,
      control: d.treatment,
      treatment: d.control,
    }));
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 14 }), (day) => {
        const a = welch(days.slice(0, day), 0.05);
        const b = welch(swapped.slice(0, day), 0.05);
        close(b.z, -a.z, 1e-12);
        close(b.p, a.p, 1e-9);
      }),
    );
  });

  it('n scales with 1 / MDE², and the plan is whole weeks', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.005, max: 0.1, noNaN: true }),
        fc.double({ min: 0.01, max: 0.1, noNaN: true }),
        fc.double({ min: 0.5, max: 0.95, noNaN: true }),
        (mde, alpha, power) => {
          const n = sampleSize(alpha, power, mde, 5, 20);
          close(sampleSize(alpha, power, mde / 2, 5, 20), 4 * n, 1e-12);
          const planned = plannedDays(n, perGroupPerDay);
          expect(planned % 7).toBe(0);
          expect(planned).toBeGreaterThanOrEqual(7);
          expect(planned * perGroupPerDay).toBeGreaterThanOrEqual(n);
        },
      ),
    );
  });
});
