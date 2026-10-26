import type { ParamRange } from '../../types';
import type { Case, Day, Pooled } from '../math';

import data from './tests.json';

/** One A/B test: 14 days of daily totals for both groups. */
export interface AbTest {
  id: string;
  title: string;
  /** What StylePulse tested, in one sentence. */
  story: string;
  /** What really happened in the simulation. */
  truth: string;
  /** Added to the verdict once the test is done; may be empty. */
  note: string;
  seed: number;
  days: Day[];
}

/** One of the six interval cases of step 7: a whole simulated test. */
export interface CaseTest {
  id: Case;
  name: string;
  verdict: string;
  /** The true lift in the simulation, and its traffic (searchers a day). */
  lift: number;
  searchers: number;
  seed: number;
  control: Pooled;
  treatment: Pooled;
}

/** One searcher on one day, as logged. */
export interface SampleRow {
  user: string;
  day: number;
  group: 'control' | 'treatment';
  /** $ spent that day. */
  spent: number;
  /** Search latency (ms). */
  latency: number;
}

export interface Dataset {
  id: string;
  title: string;
  question: string;
  note: string;
  searchersPerDay: number;
  /** The share of searchers who buy something on a usual day. */
  buyRate: number;
  /** Last month's spend per searcher per day ($), used to plan the test. */
  history: { mean: number; sd: number };
  /** The split check fails below this p-value. */
  splitLimit: number;
  /** Guardrails: the most search may slow (ms), and checkout errors rise (points). */
  limits: { latency: number; errors: number };
  /** The simulated A/A tests of "Many tests". */
  aa: { seed: number; tests: number; paths: number };
  day: ParamRange;
  /** In percent. */
  mde: ParamRange;
  alpha: ParamRange;
  power: ParamRange;
  /** $ a day. */
  cost: ParamRange;
  /** Five raw searcher-day rows, to show what the logs hold. */
  sample: SampleRow[];
  /** One simulated test per interval case, for the figure in step 7. */
  cases: CaseTest[];
  /** The A/A test first, then the scenarios of step 5. */
  tests: AbTest[];
}

// Written by python/a_b_testing.py and checked by math.test.ts.
export const datasets = [data] as Dataset[];
