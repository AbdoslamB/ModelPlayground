import type { ParamRange } from '../../types';
import type { Rewards, World } from '../math';

import mazes from './mazes.json';

export interface Dataset {
  id: string;
  title: string;
  question: string;
  note: string;
  /** The mazes; the page's "Refresh Data" button moves to the next. */
  mazes: World[];
  rewards: Rewards;
  /** An episode stops after this many moves even if nothing was found. */
  maxEpisodeSteps: number;
  /** Seed of the exploring mouse's random moves. */
  seed: number;
  episodes: ParamRange;
  alpha: ParamRange;
  gamma: ParamRange;
  epsilon: ParamRange;
}

// Written by python/q_learning.py and checked by math.test.ts.
export const datasets = [mazes] as Dataset[];
