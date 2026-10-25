import type { ParamRange } from '../../types';
import type { Weights } from '../math';

import rnn from './rnn.json';

export interface Dataset {
  id: string;
  title: string;
  question: string;
  note: string;
  /** Every character the network knows, in order. */
  alphabet: string;
  /** How many numbers the hidden state holds. */
  hidden: number;
  weights: Weights;
  /** Sentences to try; "Next Sentence" moves to the next. */
  examples: string[];
  /** The words the training sentences were made from. */
  words: { subjects: string[]; verbs: string[]; objects: string[] };
  temperature: ParamRange;
  /** The most characters the network reads at once. */
  maxSteps: number;
  /** Seed for "Write": the random picks are the same each time. */
  seed: number;
}

// Written by python/recurrent_neural_network.py and checked by math.test.ts.
export const datasets = [rnn] as Dataset[];
