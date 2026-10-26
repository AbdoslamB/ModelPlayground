/**
 * A/B testing: the statistics behind the Lab, as pure functions. Every
 * number the page shows comes from here. The test is Welch's z-test on the
 * daily totals of each group; python/a_b_testing.py computes the same with
 * SciPy, and math.test.ts checks the two agree.
 */
import { formatNumber } from '../../lib/format';
import { mulberry32 } from '../../lib/rng';

/** One group on one day: users, their spend ($) and the guardrail counts. */
export interface GroupDay {
  n: number;
  mean: number;
  sd: number;
  buyers: number;
  errors: number;
  /** Average search latency (ms). */
  latency: number;
}

export interface Day {
  day: number;
  control: GroupDay;
  treatment: GroupDay;
}

export type Arm = 'control' | 'treatment';

export interface Pooled {
  n: number;
  mean: number;
  sd: number;
}

export interface Result {
  nC: number;
  nT: number;
  meanC: number;
  meanT: number;
  sdC: number;
  sdT: number;
  /** x̄_T − x̄_C ($). */
  diff: number;
  se: number;
  z: number;
  /** Two-sided p-value. */
  p: number;
  /** z₁₋α/₂, the critical value. */
  crit: number;
  /** Lift and the CI's ends, as fractions of the control mean. */
  lift: number;
  lo: number;
  hi: number;
}

// ── The normal distribution ───────────────────────────────────────────────

const SQRT_PI = Math.sqrt(Math.PI);

/**
 * The complementary error function, to near double precision. Below 2 it is
 * 1 − erf(x), with erf from its all-positive series; from 2 up, a continued
 * fraction (modified Lentz), which keeps tiny tails accurate.
 */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return 2 - erfc(-x);
  if (x < 2) {
    // erf(x) = 2/√π · e^(−x²) · Σ 2ⁿ x^(2n+1) / (1·3·5·…·(2n+1))
    let term = x;
    let sum = x;
    for (let n = 1; n < 200 && term > sum * 1e-17; n++) {
      term *= (2 * x * x) / (2 * n + 1);
      sum += term;
    }
    return 1 - (2 / SQRT_PI) * Math.exp(-x * x) * sum;
  }
  // erfc(x) = e^(−x²)/√π · 1 / (x + ½ / (x + 1 / (x + 3⁄2 / (x + 2 / …))))
  const tiny = 1e-300;
  let f = x;
  let c = x;
  let d = 0;
  for (let k = 1; k < 5000; k++) {
    const a = k / 2;
    d = x + a * d;
    d = Math.abs(d) < tiny ? 1 / tiny : 1 / d;
    c = x + a / c;
    if (Math.abs(c) < tiny) c = tiny;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / SQRT_PI / f;
}

/** P(Z ≤ z) for a standard normal Z. */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

/** Two-sided p-value of a z statistic: P(|Z| ≥ |z|). */
export function twoSided(z: number): number {
  return erfc(Math.abs(z) / Math.SQRT2);
}

/** The z with P(Z ≤ z) = p, e.g. 0.975 → 1.959964. */
export function normalQuantile(p: number): number {
  if (!(p > 0)) return -Infinity;
  if (!(p < 1)) return Infinity;
  // Tukey's rough guess (within about 0.01 in the middle), then Halley
  // steps on the exact CDF, each roughly tripling the correct digits.
  let x = 4.91 * (p ** 0.14 - (1 - p) ** 0.14);
  for (let i = 0; i < 5; i++) {
    const e = normalCdf(x) - p;
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    x -= u / (1 + (x * u) / 2);
  }
  return x;
}

// ── The test ──────────────────────────────────────────────────────────────

/**
 * All the days of one group together, exactly: the users add up, the mean is
 * the users' mean, and M₂ = Σ[(nᵢ − 1)sᵢ² + nᵢ(x̄ᵢ − x̄)²] gives s² = M₂ / (n − 1).
 */
export function pool(days: readonly Day[], arm: Arm): Pooled {
  let n = 0;
  let total = 0;
  for (const d of days) {
    n += d[arm].n;
    total += d[arm].n * d[arm].mean;
  }
  const mean = total / n;
  let m2 = 0;
  for (const d of days) {
    const g = d[arm];
    m2 += (g.n - 1) * g.sd * g.sd + g.n * (g.mean - mean) * (g.mean - mean);
  }
  return { n, mean, sd: Math.sqrt(m2 / (n - 1)) };
}

/** Welch's z-test of the treatment against the control, with its CI. */
export function welch(days: readonly Day[], alpha: number): Result {
  const c = pool(days, 'control');
  const t = pool(days, 'treatment');
  const diff = t.mean - c.mean;
  const se = Math.sqrt((t.sd * t.sd) / t.n + (c.sd * c.sd) / c.n);
  const z = diff / se;
  const crit = normalQuantile(1 - alpha / 2);
  return {
    nC: c.n,
    nT: t.n,
    meanC: c.mean,
    meanT: t.mean,
    sdC: c.sd,
    sdT: t.sd,
    diff,
    se,
    z,
    p: twoSided(z),
    crit,
    lift: diff / c.mean,
    lo: (diff - crit * se) / c.mean,
    hi: (diff + crit * se) / c.mean,
  };
}

/**
 * The split check (sample ratio mismatch): a χ² test that the users really
 * split 50/50. χ² = Σ (O − E)² / E; with 1 degree of freedom, p = erfc(√(χ²/2)).
 */
export function splitCheck(
  nC: number,
  nT: number,
): { chi2: number; p: number } {
  const expected = (nC + nT) / 2;
  const chi2 =
    ((nC - expected) * (nC - expected) + (nT - expected) * (nT - expected)) /
    expected;
  return { chi2, p: erfc(Math.sqrt(chi2 / 2)) };
}

/**
 * Users needed per group: n = 2 (z₁₋α/₂ + z_power)² σ² / δ², where the MDE δ
 * is `mde` (a fraction) of the usual mean.
 */
export function sampleSize(
  alpha: number,
  power: number,
  mde: number,
  mean: number,
  sd: number,
): number {
  const zs = normalQuantile(1 - alpha / 2) + normalQuantile(power);
  const delta = mde * mean;
  return (2 * zs * zs * sd * sd) / (delta * delta);
}

/** Days the test must run: enough users, rounded up to whole weeks (at least one). */
export function plannedDays(n: number, perGroupPerDay: number): number {
  const days = Math.ceil(n / perGroupPerDay);
  return Math.max(7, Math.ceil(days / 7) * 7);
}

/** The relative SE a test planned with these numbers has after `day` days. */
export function designSe(
  day: number,
  perGroupPerDay: number,
  mean: number,
  sd: number,
): number {
  return (sd * Math.sqrt(2 / (day * perGroupPerDay))) / mean;
}

export type Case =
  'borderline' | 'none' | 'small' | 'uncertain' | 'win' | 'worse';

/** Where the CI [lo, hi] sits against 0 and the MDE m: one of six cases. */
export function ciCase(lo: number, hi: number, mde: number): Case {
  if (lo > mde) return 'win';
  if (hi < 0) return 'worse';
  if (lo > 0 && hi < mde) return 'small';
  if (lo > 0) return 'borderline';
  if (hi < mde) return 'none';
  return 'uncertain';
}

export interface Fade {
  /** The lift in the first and the last week, as fractions. */
  first: number;
  last: number;
  z: number;
  p: number;
}

/** Did the lift shrink? A z-test of the first week's lift against the last week's. */
export function fade(first: readonly Day[], last: readonly Day[]): Fade {
  const a = welch(first, 0.05);
  const b = welch(last, 0.05);
  const z = (a.lift - b.lift) / Math.hypot(a.se / a.meanC, b.se / b.meanC);
  return { first: a.lift, last: b.lift, z, p: twoSided(z) };
}

export interface Guardrails {
  /** Treatment minus control: search latency (ms) and checkout errors (percentage points). */
  latency: number;
  errors: number;
  latencyOk: boolean;
  errorsOk: boolean;
}

export function guardrails(
  days: readonly Day[],
  limits: { latency: number; errors: number },
): Guardrails {
  const sum = (arm: Arm, key: 'buyers' | 'errors' | 'n') =>
    days.reduce((s, d) => s + d[arm][key], 0);
  const latency = (arm: Arm) =>
    days.reduce((s, d) => s + d[arm].n * d[arm].latency, 0) / sum(arm, 'n');
  const rate = (arm: Arm) => sum(arm, 'errors') / sum(arm, 'buyers');
  const slower = latency('treatment') - latency('control');
  const errors = (rate('treatment') - rate('control')) * 100;
  return {
    latency: slower,
    errors,
    latencyOk: slower <= limits.latency,
    errorsOk: errors <= limits.errors,
  };
}

export interface Money {
  /** Net $ a day for every searcher: expected, and at the CI's low end. */
  expected: number;
  cautious: number;
  /** The lift that just pays the cost, as a fraction. */
  breakEven: number;
}

export function money(result: Result, searchers: number, cost: number): Money {
  return {
    expected: searchers * result.diff - cost,
    cautious: searchers * result.lo * result.meanC - cost,
    breakEven: cost / (searchers * result.meanC),
  };
}

// ── The verdict ───────────────────────────────────────────────────────────

/** "+3.6%" or "−1.2%", from a fraction. */
export function percent(fraction: number, decimals = 1): string {
  const text = formatNumber(fraction * 100, decimals);
  return `${fraction * 100 >= 0.5 * 10 ** -decimals ? '+' : ''}${text}%`;
}

/** The MDE as "2%" or "2.5%", from a fraction. */
export function mdeText(mde: number): string {
  const whole = Number.isInteger(Math.round(mde * 1000) / 10);
  return `${formatNumber(mde * 100, whole ? 0 : 1)}%`;
}

/** "0.026", "0.0012" or "< 0.0001". */
export function pValue(p: number): string {
  if (p < 0.0001) return '< 0.0001';
  return formatNumber(p, p < 0.01 ? 4 : 3);
}

/** "p = 0.026", "p = 0.0012" or "p < 0.0001". */
export function pText(p: number): string {
  return p < 0.0001 ? 'p < 0.0001' : `p = ${pValue(p)}`;
}

/** "+4", "−0.02" or "0": a change, with its sign. */
export function signed(value: number, decimals: number): string {
  return `${value >= 0.5 * 10 ** -decimals ? '+' : ''}${formatNumber(value, decimals)}`;
}

/** "21.2%", from a fraction, with no sign. */
export function share(fraction: number, decimals = 1): string {
  return `${formatNumber(fraction * 100, decimals)}%`;
}

/** "$4,000" or "−$1,250". */
export function dollars(value: number): string {
  const text = formatNumber(Math.abs(value), 0);
  return `${value < 0 && text !== '0' ? '−' : ''}$${text}`;
}

export type VerdictKind =
  Case | 'costly' | 'early' | 'faded' | 'guardrail' | 'invalid';

export interface Verdict {
  kind: VerdictKind;
  /** good: launch; bad: don't; warn: not sure yet; wait: keep going. */
  tone: 'bad' | 'good' | 'wait' | 'warn';
  title: string;
  detail: string;
}

export interface DecideInput {
  day: number;
  planned: number;
  /** How many days of data there are. */
  lastDay: number;
  alpha: number;
  mde: number;
  result: Result;
  split: { p: number };
  splitLimit: number;
  guard: Guardrails;
  /** Only once the plan's two weeks are in. */
  fade: Fade | null;
  /** Leave out to skip the cost check. */
  money?: Money | null;
  cost?: number;
}

/**
 * The verdict, from checks in a fixed order; the first that applies wins:
 * too early, uneven split, guardrails, a fading lift, the CI case, then cost.
 */
export function decide(input: DecideInput): Verdict {
  const { result: r, mde } = input;
  const ci = `${percent(r.lo)} to ${percent(r.hi)}`;
  const target = mdeText(mde);

  if (input.day < input.planned) {
    if (input.day >= input.lastDay) {
      return {
        kind: 'early',
        tone: 'wait',
        title: `Too early: the plan needs ${input.planned} days`,
        detail: `The data has only ${input.lastDay} days. A bigger MDE or α, or lower power, shortens the plan.`,
      };
    }
    const significant = r.p < input.alpha;
    return {
      kind: 'early',
      tone: 'wait',
      title: `Too early: day ${input.day} of ${input.planned}`,
      detail: significant
        ? `Stopping now would look like a ${percent(r.lift)} ${r.diff > 0 ? 'win' : 'loss'} (${pText(r.p)}).`
        : `So far ${percent(r.lift)} (${pText(r.p)}): no clear difference yet.`,
    };
  }
  if (input.split.p < input.splitLimit) {
    return {
      kind: 'invalid',
      tone: 'bad',
      title: 'Invalid test: the groups are uneven',
      detail: `The split check gives ${pText(input.split.p)}: ${formatNumber(r.nC, 0)} control against ${formatNumber(r.nT, 0)} treatment users. Fix the tracking and run again.`,
    };
  }
  if (!input.guard.latencyOk || !input.guard.errorsOk) {
    return {
      kind: 'guardrail',
      tone: 'bad',
      title: 'Don’t launch: a guardrail broke',
      detail: input.guard.latencyOk
        ? `Checkout errors rose by ${formatNumber(input.guard.errors, 2)} points.`
        : `Search got ${formatNumber(input.guard.latency, 0)} ms slower.`,
    };
  }
  const found = ciCase(r.lo, r.hi, mde);
  const f = input.fade;
  if (
    f &&
    (found === 'win' || found === 'borderline') &&
    f.p < 0.05 &&
    f.last < mde
  ) {
    return {
      kind: 'faded',
      tone: 'bad',
      title: 'Don’t launch: the lift faded',
      detail: `It fell from ${percent(f.first)} in week 1 to ${percent(f.last)} in week 2 (${pText(f.p)}): people were trying something new.`,
    };
  }
  if (found === 'win' && input.money && input.money.cautious < 0) {
    return {
      kind: 'costly',
      tone: 'bad',
      title: 'Don’t launch: it may cost more than it earns',
      detail: `At ${dollars(input.cost ?? 0)} a day, the cautious gain is ${dollars(input.money.cautious)} a day.`,
    };
  }
  switch (found) {
    case 'borderline':
      return {
        kind: found,
        tone: 'warn',
        title: 'Not proven: run a longer test',
        detail: `It helps (${pText(r.p)}), but maybe by less than ${target}: the interval reaches down to ${percent(r.lo)}.`,
      };
    case 'none':
      return {
        kind: found,
        tone: 'bad',
        title: 'No useful effect',
        detail: `The interval, ${ci}, stays under the ${target} MDE.`,
      };
    case 'small':
      return {
        kind: found,
        tone: 'bad',
        title: 'Don’t launch: real, but too small',
        detail: `The whole interval, ${ci}, is under the ${target} MDE.`,
      };
    case 'uncertain':
      return {
        kind: found,
        tone: 'warn',
        title: 'Too uncertain: run a bigger test',
        detail: `The interval, ${ci}, spans both 0 and the ${target} MDE.`,
      };
    case 'win':
      return {
        kind: found,
        tone: 'good',
        title: 'Launch',
        detail: `The whole interval, ${ci}, is above the ${target} MDE.`,
      };
    case 'worse':
      return {
        kind: found,
        tone: 'bad',
        title: 'Don’t launch: it is worse',
        detail: `The whole interval, ${ci}, is below 0.`,
      };
  }
}

// ── Many A/A tests ────────────────────────────────────────────────────────

export interface AaRuns {
  tests: number;
  /** Tests whose z crossed ±z₁₋α/₂ on some day, and on the last day. */
  ever: number;
  end: number;
  /** The z after each day, for the first `keep` tests. */
  paths: number[][];
}

/**
 * Simulated A/A tests: each day adds an independent N(0, 1) step to a sum,
 * and z after k days is the sum / √k. Normals come from mulberry32 by
 * Box–Muller, as in python/a_b_testing.py.
 */
export function aaRuns(
  seed: number,
  tests: number,
  looks: number,
  crit: number,
  keep = 0,
): AaRuns {
  const random = mulberry32(seed);
  let spare: number | null = null;
  const normal = () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    const u = 1 - random();
    const v = random();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  let ever = 0;
  let end = 0;
  const paths: number[][] = [];
  for (let t = 0; t < tests; t++) {
    let total = 0;
    let crossed = false;
    const path: number[] = [];
    for (let k = 1; k <= looks; k++) {
      total += normal();
      const z = total / Math.sqrt(k);
      path.push(z);
      if (Math.abs(z) > crit) crossed = true;
    }
    if (crossed) ever += 1;
    if (Math.abs(path[looks - 1] ?? 0) > crit) end += 1;
    if (t < keep) paths.push(path);
  }
  return { tests, ever, end, paths };
}
