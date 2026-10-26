import type { AbTest, Dataset } from './data';
import type { Fade, Result } from './math';

import { clamp, snap } from '../../lib/format';
import {
  aaRuns,
  ciCase,
  decide,
  fade,
  guardrails,
  money,
  normalQuantile,
  plannedDays,
  sampleSize,
  splitCheck,
  welch,
} from './math';

export type SymbolId = 'alpha' | 'cost' | 'day' | 'mde' | 'power';

export type Selection =
  | { kind: 'item'; id: number; source: 'graph' | 'table' }
  | { kind: 'symbol'; id: SymbolId };

type Setting = 'alpha' | 'cost' | 'mde' | 'power';

/** Where the test puts people into a group (step 1). */
export type Entry = 'buy' | 'home' | 'search';
/** The primary metric (step 1). */
export type Metric = 'spend' | 'time';
/** How long the test runs (step 3): 3 days, or the full plan. */
export type Duration = 'full' | 'short';

/** Days a "fast" test runs before stopping. */
export const SHORT_DAYS = 3;
/** The day the VP asks to stop early. */
export const PEEK_DAY = 3;

/**
 * The A/B Testing story's state, step by step. Input writes the learner's
 * choices (where to randomize, the metric, the contract, how long to run,
 * the A/A test), the experiment's day and whether it runs, the scenario, the
 * daily cost and the selection. Every number is derived from those through
 * math.ts; choices made early change what the later steps show.
 */
export class AbLab {
  readonly dataset: Dataset;

  // ── Steps 1–3: the learner's choices ──
  entry = $state<Entry>('home');
  metric = $state<Metric | null>(null);
  /** In percent, as on the slider. */
  mde = $state(2);
  alpha = $state(0.05);
  power = $state(0.8);
  /** The contract as signed in step 2, or null before signing. */
  signed = $state<{ mde: number; alpha: number; power: number } | null>(null);
  duration = $state<Duration | null>(null);
  aaRun = $state(false);

  // ── Step 4: the experiment ──
  day = $state(1);
  running = $state(false);
  /** The VP's message on day 3 is waiting for an answer. */
  peekOpen = $state(false);
  /** The learner answered the VP (either way) during this run. */
  peekAnswered = $state(false);
  /** The learner stopped early on day 3. */
  peeked = $state(false);
  many = $state(false);

  // ── Steps 5–7 ──
  /** Index into dataset.tests; 0 is the A/A test, so scenarios start at 1. */
  scenario = $state(1);
  seen = $state<number[]>([1]);
  cost = $state(4000);
  selection = $state<Selection | null>(null);

  constructor(dataset: Dataset) {
    this.dataset = dataset;
    this.mde = dataset.mde.initial;
    this.alpha = dataset.alpha.initial;
    this.power = dataset.power.initial;
    this.cost = dataset.cost.initial;
  }

  readonly test: AbTest = $derived.by(() => {
    const test = this.dataset.tests[this.scenario] ?? this.dataset.tests[1];
    if (!test) throw new Error('A/B Testing has no data');
    return test;
  });
  /** The scenarios of step 5, with their index in dataset.tests. */
  readonly scenarios = $derived.by(() =>
    this.dataset.tests
      .map((test, index) => ({ test, index }))
      .filter(({ index }) => index > 0),
  );
  readonly lastDay = $derived(this.test.days.length);
  readonly perGroupPerDay = $derived.by(() => this.dataset.searchersPerDay / 2);

  // ── The plan ──
  readonly mdeFraction = $derived(this.mde / 100);
  readonly n = $derived.by(() =>
    sampleSize(
      this.alpha,
      this.power,
      this.mdeFraction,
      this.dataset.history.mean,
      this.dataset.history.sd,
    ),
  );
  readonly zAlpha = $derived(normalQuantile(1 - this.alpha / 2));
  readonly zPower = $derived(normalQuantile(this.power));
  /** The MDE in $ per searcher per day. */
  readonly delta = $derived.by(
    () => this.mdeFraction * this.dataset.history.mean,
  );
  /** What the MDE is worth a day, for all searchers. */
  readonly deltaPerDay = $derived.by(
    () => this.delta * this.dataset.searchersPerDay,
  );
  /** The interval's level: 95 for α = 0.05. */
  readonly confidence = $derived(Math.round((1 - this.alpha) * 100));
  readonly trafficDays = $derived(this.n / this.perGroupPerDay);
  readonly planned = $derived(plannedDays(this.n, this.perGroupPerDay));
  /**
   * Randomizing every homepage visitor: twice the traffic, but half of them
   * never search, so the effect per visitor halves (assuming the same spread).
   */
  readonly diluted = $derived.by(() => {
    const n = sampleSize(
      this.alpha,
      this.power,
      this.mdeFraction / 2,
      this.dataset.history.mean,
      this.dataset.history.sd,
    );
    return { n, days: plannedDays(n, this.dataset.searchersPerDay) };
  });
  /** The contract changed after it was signed: the goalposts moved. */
  readonly moved = $derived(
    this.signed !== null &&
      (this.signed.mde !== this.mde ||
        this.signed.alpha !== this.alpha ||
        this.signed.power !== this.power),
  );

  /** The last day the test runs: 3 for a fast test, else the plan's end. */
  readonly end = $derived(
    this.duration === 'short'
      ? Math.min(SHORT_DAYS, this.planned, this.lastDay)
      : Math.min(this.planned, this.lastDay),
  );
  readonly today = $derived(clamp(this.day, 1, this.end));

  // ── The A/A test of step 3 ──
  readonly aaTest = $derived.by(() => this.dataset.tests[0]);
  readonly aaDaily: Result[] = $derived.by(() => {
    const days = this.aaTest?.days ?? [];
    return days.map((_, i) => welch(days.slice(0, i + 1), this.alpha));
  });
  readonly aaResult = $derived(this.aaDaily[this.aaDaily.length - 1]);
  readonly aaSplit = $derived(
    this.aaResult
      ? splitCheck(this.aaResult.nC, this.aaResult.nT)
      : { chi2: 0, p: 1 },
  );
  /** The first day the A/A test's p dipped under α (1-based), or 0. */
  readonly aaDip = $derived(
    this.aaDaily.findIndex((r) => r.p < this.alpha) + 1,
  );

  // ── The results so far, after every day ──
  readonly daily: Result[] = $derived.by(() =>
    this.test.days.map((_, i) =>
      welch(this.test.days.slice(0, i + 1), this.alpha),
    ),
  );
  readonly result = $derived(this.daily[this.today - 1] ?? this.daily[0]);
  readonly final = $derived(this.daily[this.end - 1] ?? this.result);
  readonly peekResult = $derived(this.daily[PEEK_DAY - 1]);
  readonly split = $derived(
    this.result
      ? splitCheck(this.result.nC, this.result.nT)
      : { chi2: 0, p: 1 },
  );
  readonly guard = $derived.by(() =>
    guardrails(this.test.days.slice(0, this.today), this.dataset.limits),
  );
  /** Week 1, and the days since (once the second week has started). */
  readonly week1 = $derived(
    this.today >= 7 ? welch(this.test.days.slice(0, 7), this.alpha) : null,
  );
  readonly week2 = $derived(
    this.today >= 8
      ? welch(this.test.days.slice(7, this.today), this.alpha)
      : null,
  );
  readonly weeks: Fade | null = $derived(
    this.today >= 8
      ? fade(this.test.days.slice(0, 7), this.test.days.slice(7, this.today))
      : null,
  );
  readonly money = $derived.by(() =>
    this.result
      ? money(this.result, this.dataset.searchersPerDay, this.cost)
      : null,
  );
  readonly found = $derived(
    this.result
      ? ciCase(this.result.lo, this.result.hi, this.mdeFraction)
      : 'none',
  );
  readonly verdict = $derived.by(() => {
    const r = this.result;
    if (!r) return null;
    const verdict = decide({
      day: this.today,
      planned: this.planned,
      lastDay: this.lastDay,
      alpha: this.alpha,
      mde: this.mdeFraction,
      result: r,
      split: this.split,
      splitLimit: this.dataset.splitLimit,
      guard: this.guard,
      fade: this.planned >= 14 && this.today >= 14 ? this.weeks : null,
      money: this.money,
      cost: this.cost,
    });
    const done = verdict.kind !== 'early';
    return done && this.test.note
      ? { ...verdict, detail: `${verdict.detail} ${this.test.note}` }
      : verdict;
  });

  /** The y-range of the graph: every day's widest CI, 0 and the largest MDE. */
  readonly range: [number, number] = $derived.by(() => {
    const widest = this.test.days.map((_, i) =>
      welch(this.test.days.slice(0, i + 1), this.dataset.alpha.min),
    );
    const lo = Math.min(0, ...widest.map((w) => w.lo));
    const hi = Math.max(this.dataset.mde.max / 100, ...widest.map((w) => w.hi));
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad];
  });

  /** "Many tests": simulated A/A runs at this α (computed only when shown). */
  readonly runs = $derived.by(() =>
    aaRuns(
      this.dataset.aa.seed,
      this.dataset.aa.tests,
      this.lastDay,
      this.zAlpha,
      this.dataset.aa.paths,
    ),
  );
  readonly falseAlarms = $derived({
    ever: this.runs.ever / this.runs.tests,
    end: this.runs.end / this.runs.tests,
  });

  // ── Progress: which steps' tasks are done ──
  readonly done = $derived.by(() => {
    const ran = this.today >= this.end && !this.peekOpen;
    const steps = [
      this.entry === 'search' && this.metric === 'spend',
      this.signed !== null && !this.moved,
      this.duration !== null && this.aaRun,
      ran,
      this.seen.length >= 2,
      ran,
    ];
    return [...steps, steps.every(Boolean)];
  });

  // ── Selection ──
  readonly selectedDay = $derived(
    this.selection?.kind === 'item' ? this.selection.id : null,
  );
  /** The day the equations show: the selected one if it has happened, else today. */
  readonly shownDay = $derived(
    this.selectedDay !== null && this.selectedDay <= this.today
      ? this.selectedDay
      : this.today,
  );
  readonly shown = $derived(this.daily[this.shownDay - 1] ?? this.result);
  readonly highlight = $derived(
    this.selection?.kind === 'symbol' ? this.selection.id : null,
  );

  set(name: Setting, value: number): void {
    const { min, max, step } = this.dataset[name];
    const atEnd = this.today >= this.end;
    this[name] = snap(clamp(value, min, max), step);
    // Today stays at the plan's end if it was there, and never goes past it.
    this.day = atEnd ? this.end : Math.min(this.day, this.end);
  }

  sign(): void {
    this.signed = { mde: this.mde, alpha: this.alpha, power: this.power };
  }

  setDuration(duration: Duration): void {
    this.duration = duration;
    this.day = Math.min(this.day, this.end);
  }

  setDay(value: number): void {
    this.running = false;
    this.day = clamp(Math.round(value), 1, this.end);
  }

  /** Runs the experiment day by day; from the end, it starts again. */
  run(): void {
    if (this.peekOpen) return;
    if (this.running) {
      this.running = false;
      return;
    }
    if (this.today >= this.end) {
      this.day = 1;
      this.peekAnswered = false;
      this.peeked = false;
    }
    this.running = true;
  }

  /**
   * One more day. On day 3 the VP asks to stop, if the test looks like a win
   * by then and the plan runs longer.
   */
  tick(): void {
    if (this.today >= this.end) {
      this.running = false;
      return;
    }
    this.day = this.today + 1;
    const r = this.daily[PEEK_DAY - 1];
    if (
      this.day === PEEK_DAY &&
      this.end > PEEK_DAY &&
      !this.peekAnswered &&
      r &&
      r.p < this.alpha &&
      r.diff > 0
    ) {
      this.running = false;
      this.peekOpen = true;
    }
    if (this.today >= this.end) this.running = false;
  }

  /** Answer the VP: stop and launch now (the trap), or keep going. */
  answerPeek(stop: boolean): void {
    this.peekOpen = false;
    this.peekAnswered = true;
    this.peeked = stop;
    this.running = !stop;
  }

  /** After the trap: run on to the plan's end. */
  resume(): void {
    this.running = true;
  }

  setScenario(index: number): void {
    this.scenario = index;
    if (!this.seen.includes(index)) this.seen = [...this.seen, index];
    this.running = false;
    this.peekOpen = false;
    this.selection = null;
    this.day = this.end;
  }

  select(selection: Selection | null): void {
    this.selection = selection;
  }

  release(kind: Selection['kind'], id: number | string): void {
    if (this.selection?.kind === kind && this.selection.id === id) {
      this.selection = null;
    }
  }
}
