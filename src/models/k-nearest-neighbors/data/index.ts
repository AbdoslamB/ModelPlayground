import type { DatasetColumn } from '../../types';

import fruit from './fruit.json';

export interface Row {
  id: number;
  x: number;
  y: number;
  label: string;
}

export interface ClassInfo {
  id: string;
  name: string;
  plural: string;
  shape: 'circle' | 'triangle';
}

export interface Dataset {
  id: string;
  title: string;
  question: string;
  /** Where the new fruit starts. */
  start: { x: number; y: number };
  note: string;
  columns: DatasetColumn[];
  classes: ClassInfo[];
  axes: { x: [number, number]; y: [number, number] };
  /** The values k can take: odd, so two classes can never tie. */
  ks: number[];
  startK: number;
  /** Sets of rows; the page's "Refresh Data" button moves to the next. */
  batches: Row[][];
}

// JSON types widen tuples (axes) and unions (column roles, shapes). The file is
// written by python/k_nearest_neighbors.py and checked by math.test.ts.
export const datasets = [fruit] as unknown as Dataset[];
