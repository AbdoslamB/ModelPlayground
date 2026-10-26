/**
 * The Python versions of the Lab, as text. They take the Lab's test up to
 * today (the daily totals of each group), α, power and the MDE, and print
 * the split check, Welch's z-test, the interval, the plan and the CI case, so
 * the numbers they print are the Lab's. python.test.ts checks that.
 */
import type { PythonProgram } from '../../lib/python';
import type { Day } from './math';

import { pyList, pyNumber, pyString } from '../../lib/pycode';

export interface PythonData {
  title: string;
  /** The days so far. */
  days: Day[];
  alpha: number;
  power: number;
  /** A fraction, e.g. 0.02. */
  mde: number;
  /** Last month's spend per searcher per day ($). */
  mean: number;
  sd: number;
  perGroupPerDay: number;
}

function head(data: PythonData): string {
  const column = (arm: 'control' | 'treatment', key: 'mean' | 'n' | 'sd') =>
    pyList(data.days.map((d) => d[arm][key]));
  const last = data.days.length;
  return `# ${data.title}: days 1 to ${last}, the daily totals of each group.
# Control saw the old search ranking; treatment saw RankNet-v2.
title = ${pyString(data.title)}
n_c = ${column('control', 'n')}  # users each day
mean_c = ${column('control', 'mean')}  # their average spend ($)
sd_c = ${column('control', 'sd')}  # and its standard deviation ($)
n_t = ${column('treatment', 'n')}
mean_t = ${column('treatment', 'mean')}
sd_t = ${column('treatment', 'sd')}

alpha, power, mde = ${pyNumber(data.alpha)}, ${pyNumber(data.power)}, ${pyNumber(data.mde)}
mu, sigma = ${pyNumber(data.mean)}, ${pyNumber(data.sd)}  # last month's spend per searcher per day ($)
per_group_per_day = ${pyNumber(data.perGroupPerDay)}

def p_text(p):
    return "p < 0.0001" if p < 0.0001 else f"p = {p:.4f}"

def ci_case(lo, hi):
    """Where the interval sits against 0 and the MDE."""
    if lo > mde:
        return "launch: the whole interval is above the MDE"
    if hi < 0:
        return "worse: the whole interval is below 0"
    if lo > 0 and hi < mde:
        return "real, but too small: the whole interval is under the MDE"
    if lo > 0:
        return "not proven: it helps, but maybe by less than the MDE"
    if hi < mde:
        return "no useful effect: the interval stays under the MDE"
    return "too uncertain: the interval spans both 0 and the MDE"`;
}

/** The same printout for both. */
const report = `print(f"{title}, days 1 to {len(n_c)}")
print(f"Users: {nC:,} control, {nT:,} treatment")
print(f"Split check: χ² = {chi2:.2f}, {p_text(split_p)}"
      + ("  (uneven! fix the tracking before trusting anything)" if split_p < 0.001 else ""))
print(f"Spend per searcher: \${mC:.4f} control, \${mT:.4f} treatment")
print(f"Difference: \${diff:.4f} ± \${crit * se:.4f} ({1 - alpha:.0%} interval)")
print(f"z = {z:.2f}, {p_text(p)}")
print(f"Lift: {diff / mC:+.2%}, {1 - alpha:.0%} interval {lo:+.2%} to {hi:+.2%}")`;

const plan = `print(f"Plan: {n:,.0f} users per group = {n / per_group_per_day:.1f} days of traffic, "
      f"so {planned} days")
print(f"CI case against the {mde * 100:g}% MDE: {ci_case(lo, hi)}")`;

/** With SciPy (and NumPy): the library does the tails and the χ² test. */
export function scipyPython(data: PythonData): string {
  return `import math

import numpy as np
from scipy import stats

${head(data)}

def pool(n, mean, sd):
    """All days of one group together: users, their mean and their sd."""
    n, mean, sd = np.array(n), np.array(mean), np.array(sd)
    total = n.sum()
    m = (n * mean).sum() / total
    m2 = ((n - 1) * sd**2 + n * (mean - m) ** 2).sum()  # squared distances from m
    return int(total), m, np.sqrt(m2 / (total - 1))

nC, mC, sC = pool(n_c, mean_c, sd_c)
nT, mT, sT = pool(n_t, mean_t, sd_t)

# 1. The split check: did the users really split 50/50?
chi2, split_p = stats.chisquare([nC, nT])

# 2. Welch's z-test: how many standard errors apart are the two means?
diff = mT - mC
se = np.sqrt(sT**2 / nT + sC**2 / nC)
z = diff / se
p = 2 * stats.norm.sf(abs(z))  # two-sided
crit = stats.norm.ppf(1 - alpha / 2)
lo, hi = (diff - crit * se) / mC, (diff + crit * se) / mC

${report}

# SciPy's Welch t-test uses the t distribution; with this many users it agrees.
t = stats.ttest_ind_from_stats(mT, sT, nT, mC, sC, nC, equal_var=False)
print(f"SciPy's Welch t-test: t = {t.statistic:.2f}, {p_text(t.pvalue)}")

# 3. The plan: users per group to spot a lift of mde × mu with this power
n = 2 * (stats.norm.ppf(1 - alpha / 2) + stats.norm.ppf(power)) ** 2 * sigma**2 / (mde * mu) ** 2
planned = max(7, math.ceil(math.ceil(n / per_group_per_day) / 7) * 7)  # whole weeks
${plan}
`;
}

/** Both tabs of "Try it in Python", SciPy first. */
export function programs(data: PythonData): PythonProgram[] {
  return [
    { id: 'scipy', label: 'With SciPy', code: scipyPython(data) },
    { id: 'plain', label: 'Plain Python', code: plainPython(data) },
  ];
}

/** Plain Python, no libraries: the normal tails from math.erfc. */
export function plainPython(data: PythonData): string {
  return `import math
from statistics import NormalDist

${head(data)}

def pool(n, mean, sd):
    """All days of one group together: users, their mean and their sd."""
    total = sum(n)
    m = sum(k * x for k, x in zip(n, mean)) / total
    m2 = sum((k - 1) * s * s + k * (x - m) * (x - m) for k, x, s in zip(n, mean, sd))
    return total, m, math.sqrt(m2 / (total - 1))

nC, mC, sC = pool(n_c, mean_c, sd_c)
nT, mT, sT = pool(n_t, mean_t, sd_t)

# 1. The split check: χ² = Σ (O − E)² / E, with E half the users
expected = (nC + nT) / 2
chi2 = ((nC - expected) ** 2 + (nT - expected) ** 2) / expected
split_p = math.erfc(math.sqrt(chi2 / 2))  # 1 degree of freedom

# 2. Welch's z-test: how many standard errors apart are the two means?
diff = mT - mC
se = math.sqrt(sT * sT / nT + sC * sC / nC)
z = diff / se
p = math.erfc(abs(z) / math.sqrt(2))  # two-sided: P(|Z| ≥ |z|)
crit = NormalDist().inv_cdf(1 - alpha / 2)
lo, hi = (diff - crit * se) / mC, (diff + crit * se) / mC

${report}

# 3. The plan: users per group to spot a lift of mde × mu with this power
zs = NormalDist().inv_cdf(1 - alpha / 2) + NormalDist().inv_cdf(power)
n = 2 * zs * zs * sigma * sigma / (mde * mu) ** 2
planned = max(7, math.ceil(math.ceil(n / per_group_per_day) / 7) * 7)  # whole weeks
${plan}
`;
}
