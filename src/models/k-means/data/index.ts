import type { DatasetColumn } from '../../types';

import park from './park.json';

export interface Row {
  id: number;
  x: number;
  y: number;
}

export interface Dataset {
  id: string;
  title: string;
  question: string;
  note: string;
  columns: DatasetColumn[];
  axes: { x: [number, number]; y: [number, number] };
  /** The values k can take. */
  ks: number[];
  startK: number;
  /** Where the stands start; the first k are used. */
  starts: { x: number; y: number }[];
  /** Sets of rows; the page's "Refresh Data" button moves to the next. */
  batches: Row[][];
}

// JSON types widen tuples (axes) and unions (column roles). The file is
// written by python/k_means.py and checked by math.test.ts.
export const datasets = [park] as unknown as Dataset[];
