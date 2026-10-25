import type { ParamRange } from '../../types';
import type { Schedule } from '../math';

import pictures from './pictures.json';

export interface Picture {
  id: number;
  kind: string;
  /** 64 pixel values, row by row, from 0 (blank) to 16 (full ink). */
  pixels: number[];
  /** Where the point starts on the map: tiny random numbers. */
  start: [number, number];
}

export interface KindInfo {
  id: string;
  name: string;
}

export interface Dataset {
  id: string;
  title: string;
  question: string;
  note: string;
  /** Pictures are size × size pixels. */
  size: number;
  kinds: KindInfo[];
  schedule: Schedule & { totalSteps: number };
  perplexity: ParamRange;
  /** The optimiser's steps; the page opens on a finished map. */
  steps: ParamRange;
  /** How many nearest neighbours to compare between pixels and map. */
  neighbours: number;
  /** Sets of pictures; the page's "Refresh Data" button moves to the next. */
  batches: Picture[][];
}

// JSON types widen tuples. The file is written by python/t_sne.py and
// checked by math.test.ts.
export const datasets = [pictures] as unknown as Dataset[];
