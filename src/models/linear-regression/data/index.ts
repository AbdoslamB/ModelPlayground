import type { DatasetMeta } from '../../types';

import braking from './braking.json';
import plants from './plants.json';

export type Param = 'a' | 'b';
export type Reference =
  | 'a'
  | 'b'
  | 'flatMse'
  | 'mse'
  | 'n'
  | 'predictAt0'
  | 'predictAtMax'
  | 'predictAtMean'
  | 'r2'
  | 'xMean'
  | 'yMean';

export interface Row {
  id: number;
  x: number;
  y: number;
}

export type Dataset = DatasetMeta<Param, Reference, Row> & {
  /** The line each set was generated from, when there is one. */
  truths?: { a: number; b: number }[];
};

// JSON types widen tuples (axes) and unions (column roles) to arrays and
// strings. The files are written by python/prepare_data.py and checked by
// math.test.ts, so the cast is safe.
export const datasets = [plants, braking] as unknown as Dataset[];
