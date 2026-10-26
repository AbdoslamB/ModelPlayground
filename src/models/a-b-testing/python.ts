/**
 * The Python versions of the story, as text: one short program per step
 * that has numbers to work out, each complete on its own and printing the
 * Lab's numbers. Step 3 plans the test, step 5 checks the data, step 6 tests
 * the difference, and step 7 reads the interval and the money.
 * python.test.ts checks every one against math.ts.
 */
import type { PythonProgram } from '../../lib/python';
import type { Day } from './math';

import { pyList, pyNumber, pyString } from '../../lib/pycode';

/** The programs of each step. */
export interface StoryPython {
  plan: PythonProgram[];
  check: PythonProgram[];
  test: PythonProgram[];
  decide: PythonProgram[];
}

/** Every step's programs, from the Lab's state. */
export function storyPrograms(d: {
  plan: PlanData;
  test: TestData;
  decide: DecideData;
}): StoryPython {
  return {
    plan: planPrograms(d.plan),
    check: checkPrograms(d.test),
    test: testPrograms(d.test),
    decide: decidePrograms(d.decide),
  };
}

// ── Step 3: plan the test ─────────────────────────────────────────────────

export interface PlanData {
  alpha: number;
  power: number;
  /** A fraction, e.g. 0.02. */
  mde: number;
  /** Last month's spend per searcher per day ($). */
  mean: number;
  sd: number;
  perGroupPerDay: number;
}

const planHead = (d: PlanData) => `# The contract from step 2
alpha, power, mde = ${pyNumber(d.alpha)}, ${pyNumber(d.power)}, ${pyNumber(d.mde)}
mu, sigma = ${pyNumber(d.mean)}, ${pyNumber(d.sd)}  # last month's spend per searcher per day ($)
per_group_per_day = ${pyNumber(d.perGroupPerDay)}  # searchers a day in each group`;

const planReport = `delta = mde * mu  # the MDE in $ per searcher per day
n = 2 * (z_alpha + z_power) ** 2 * sigma**2 / delta**2  # users per group

days = n / per_group_per_day
weeks = max(1, math.ceil(math.ceil(days) / 7))  # always whole weeks
print(f"z for alpha: {z_alpha:.3f}, z for power: {z_power:.3f}")
print(f"MDE: \${delta:.2f} per searcher per day")
print(f"Users per group: {n:,.0f}")
print(f"Days of traffic: {days:.1f}, so the test runs {weeks * 7} days")`;

export function planPrograms(d: PlanData): PythonProgram[] {
  return [
    {
      id: 'scipy',
      label: 'With SciPy',
      code: `import math

from scipy import stats

${planHead(d)}

z_alpha = stats.norm.ppf(1 - alpha / 2)  # 1.96 when alpha = 0.05
z_power = stats.norm.ppf(power)  # 0.84 when power = 0.80
${planReport}
`,
    },
    {
      id: 'plain',
      label: 'Plain Python',
      code: `import math
from statistics import NormalDist

${planHead(d)}

z_alpha = NormalDist().inv_cdf(1 - alpha / 2)  # 1.96 when alpha = 0.05
z_power = NormalDist().inv_cdf(power)  # 0.84 when power = 0.80
${planReport}
`,
    },
  ];
}

// ── Steps 5 and 6: the test's daily totals ─────────────────────────────────

export interface TestData {
  title: string;
  /** The days so far. */
  days: Day[];
  alpha: number;
}

function columns(d: TestData): string {
  const column = (arm: 'control' | 'treatment', key: 'mean' | 'n' | 'sd') =>
    pyList(d.days.map((x) => x[arm][key]));
  return `# ${d.title}: days 1 to ${d.days.length}, each group's totals for each day.
# Control saw the old search ranking; treatment saw RankNet-v2.
title = ${pyString(d.title)}
n_c = ${column('control', 'n')}  # users each day
mean_c = ${column('control', 'mean')}  # their average spend ($)
sd_c = ${column('control', 'sd')}  # and its standard deviation ($)
n_t = ${column('treatment', 'n')}
mean_t = ${column('treatment', 'mean')}
sd_t = ${column('treatment', 'sd')}`;
}

const pTextDef = `def p_text(p):
    return "p < 0.0001" if p < 0.0001 else f"p = {p:.4f}"`;

const poolDef = `def pool(n, mean, sd):
    """Several days of one group together: users, their mean and their sd."""
    total = sum(n)
    m = sum(k * x for k, x in zip(n, mean)) / total
    m2 = sum((k - 1) * s * s + k * (x - m) ** 2 for k, x, s in zip(n, mean, sd))
    return total, m, math.sqrt(m2 / (total - 1))`;

const weeksCode = (
  twoSided: string,
) => `# 2. Novelty: did the lift fade from week 1 to week 2?
def lift(first, last):
    """The lift over days first+1 to last, and its standard error (fractions)."""
    nC, mC, sC = pool(n_c[first:last], mean_c[first:last], sd_c[first:last])
    nT, mT, sT = pool(n_t[first:last], mean_t[first:last], sd_t[first:last])
    se = math.sqrt(sT * sT / nT + sC * sC / nC)
    return (mT - mC) / mC, se / mC

if len(n_c) < 8:
    print("Week 2 has not started yet: run the test past day 7.")
else:
    lift1, se1 = lift(0, 7)
    lift2, se2 = lift(7, len(n_c))
    z = (lift1 - lift2) / math.sqrt(se1**2 + se2**2)
    print(f"Week 1 lift: {lift1:+.2%}")
    print(f"Week 2 lift: {lift2:+.2%}")
    print(f"Did it fade? z = {z:.2f}, {p_text(${twoSided})}")`;

const splitReport = `nC, nT = sum(n_c), sum(n_t)
print(f"{title}, days 1 to {len(n_c)}")
print(f"Users: {nC:,} control, {nT:,} treatment")
print(f"Split check: χ² = {chi2:.2f}, {p_text(split_p)}"
      + ("  (uneven! fix the tracking before trusting anything)" if split_p < 0.001 else "  (an even split)"))`;

/** Step 5: the split check, and week 1 against week 2. */
export function checkPrograms(d: TestData): PythonProgram[] {
  return [
    {
      id: 'scipy',
      label: 'With SciPy',
      code: `import math

from scipy import stats

${columns(d)}

${pTextDef}

${poolDef}

# 1. The split check: did the users really split 50/50?
chi2, split_p = stats.chisquare([sum(n_c), sum(n_t)])
${splitReport}

${weeksCode('2 * stats.norm.sf(abs(z))')}
`,
    },
    {
      id: 'plain',
      label: 'Plain Python',
      code: `import math

${columns(d)}

${pTextDef}

${poolDef}

# 1. The split check: χ² = Σ (O − E)² / E, with E half the users
expected = (sum(n_c) + sum(n_t)) / 2
chi2 = ((sum(n_c) - expected) ** 2 + (sum(n_t) - expected) ** 2) / expected
split_p = math.erfc(math.sqrt(chi2 / 2))  # 1 degree of freedom
${splitReport}

${weeksCode('math.erfc(abs(z) / math.sqrt(2))')}
`,
    },
  ];
}

const testReport = `print(f"{title}, days 1 to {len(n_c)}")
print(f"Spend per searcher: \${mC:.4f} control, \${mT:.4f} treatment")
print(f"Difference: \${diff:.4f} ± \${crit * se:.4f} ({1 - alpha:.0%} interval)")
print(f"z = {z:.2f}, {p_text(p)}")
print(f"Lift: {diff / mC:+.2%}, {1 - alpha:.0%} interval {lo:+.2%} to {hi:+.2%}")`;

/** Step 6: Welch's z-test and the interval. */
export function testPrograms(d: TestData): PythonProgram[] {
  const head = `${columns(d)}
alpha = ${pyNumber(d.alpha)}

${pTextDef}

${poolDef}

nC, mC, sC = pool(n_c, mean_c, sd_c)
nT, mT, sT = pool(n_t, mean_t, sd_t)

# Welch's z-test: how many standard errors apart are the two means?
diff = mT - mC
se = math.sqrt(sT * sT / nT + sC * sC / nC)
z = diff / se`;
  return [
    {
      id: 'scipy',
      label: 'With SciPy',
      code: `import math

from scipy import stats

${head}
p = 2 * stats.norm.sf(abs(z))  # two-sided
crit = stats.norm.ppf(1 - alpha / 2)
lo, hi = (diff - crit * se) / mC, (diff + crit * se) / mC

${testReport}

# SciPy's Welch t-test uses the t distribution; with this many users it agrees.
t = stats.ttest_ind_from_stats(mT, sT, nT, mC, sC, nC, equal_var=False)
print(f"SciPy's Welch t-test: t = {t.statistic:.2f}, {p_text(t.pvalue)}")
`,
    },
    {
      id: 'plain',
      label: 'Plain Python',
      code: `import math
from statistics import NormalDist

${head}
p = math.erfc(abs(z) / math.sqrt(2))  # two-sided: P(|Z| ≥ |z|)
crit = NormalDist().inv_cdf(1 - alpha / 2)
lo, hi = (diff - crit * se) / mC, (diff + crit * se) / mC

${testReport}
`,
    },
  ];
}

// ── Step 7: the interval's case, and the money ─────────────────────────────

export interface DecideData {
  /** The lift and its interval, as fractions of the control's mean. */
  lift: number;
  lo: number;
  hi: number;
  /** The control's mean spend per searcher per day ($). */
  meanC: number;
  mde: number;
  searchers: number;
  cost: number;
}

/** Step 7: no library needed, so one program. */
export function decidePrograms(d: DecideData): PythonProgram[] {
  return [
    {
      id: 'plain',
      label: 'Plain Python',
      code: `# The result from step 6, as fractions of the control's mean spend.
# (Steps 5 and 6 come first: a broken split or guardrail stops the launch.)
lift, lo, hi = ${pyNumber(d.lift, 10)}, ${pyNumber(d.lo, 10)}, ${pyNumber(d.hi, 10)}
mean_c = ${pyNumber(d.meanC, 10)}  # the control's spend per searcher per day ($)
mde = ${pyNumber(d.mde)}
searchers = ${pyNumber(d.searchers)}  # searchers a day, all of whom would get RankNet-v2
cost = ${pyNumber(d.cost)}  # $ a day to run RankNet-v2

def ci_case(lo, hi):
    """Where the interval sits against 0 and the MDE: one of six cases."""
    if lo > mde:
        return "Clear win: the whole interval is above the MDE. Launch."
    if hi < 0:
        return "Worse: the whole interval is below 0. Don't launch."
    if lo > 0 and hi < mde:
        return "Real but too small: the whole interval is under the MDE. Don't launch."
    if lo > 0:
        return "Borderline: it helps, but maybe by less than the MDE. Run a longer test."
    if hi < mde:
        return "No useful effect: the interval stays under the MDE. Don't launch."
    return "Too uncertain: the interval spans both 0 and the MDE. Run a bigger test."

print(f"Interval: {lo:+.2%} to {hi:+.2%}, against 0 and the {mde * 100:g}% MDE")
print(ci_case(lo, hi))

# The money: the lift is a share of what each searcher spends.
gross = searchers * lift * mean_c  # $ a day, expected
cautious = searchers * lo * mean_c  # $ a day, at the interval's low end
print(f"Gain: \${gross:,.0f} a day expected, \${cautious:,.0f} a day cautious")
print(f"Net after \${cost:,.0f} a day: \${gross - cost:,.0f} expected, \${cautious - cost:,.0f} cautious")
print(f"Break-even lift: {cost / (searchers * mean_c):.2%}")
`,
    },
  ];
}
