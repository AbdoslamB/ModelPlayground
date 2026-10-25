import type { ParamRange } from '../../types';
import type { Label, Message } from '../math';

import messages from './messages.json';

export interface ClassInfo {
  id: Label;
  name: string;
  plural: string;
}

export interface Dataset {
  id: string;
  title: string;
  question: string;
  note: string;
  classes: ClassInfo[];
  /** The messages the model learns from. */
  training: Message[];
  /** Messages to try; "Next Message" moves to the next. */
  examples: string[];
  /** Smoothing α. */
  alphas: ParamRange;
}

// JSON types widen unions (labels). The file is written by
// python/naive_bayes.py and checked by math.test.ts.
export const datasets = [messages] as unknown as Dataset[];
