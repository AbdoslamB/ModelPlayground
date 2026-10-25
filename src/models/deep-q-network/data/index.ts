import type { ParamRange } from '../../types';
import type { Rewards, Settings, World } from '../math';

import fields from './fields.json';

export interface Dataset {
  id: string;
  title: string;
  question: string;
  note: string;
  /** The fields; the page's "Refresh Data" button moves to the next. */
  worlds: World[];
  rewards: Rewards;
  settings: Settings;
  /** Training steps; the page opens on a trained network. */
  steps: ParamRange;
  epsilon: ParamRange;
}

// Written by python/deep_q_network.py and checked by math.test.ts.
export const datasets = [fields] as Dataset[];
