import type { DatasetColumn, ParamRange } from '../../types';
import type { Row } from '../math';

import seeds from './seeds.json';

export interface ClassInfo {
  id: string;
  name: string;
  /** A one-word name for the table. */
  short: string;
  plural: string;
  shape: 'circle' | 'triangle';
}

export interface Dataset {
  id: string;
  title: string;
  question: string;
  note: string;
  columns: DatasetColumn[];
  classes: ClassInfo[];
  axes: { x: [number, number]; y: [number, number] };
  /** How deep each tree may grow. */
  maxDepth: number;
  /** How many trees: odd, so two kinds never tie. */
  trees: ParamRange;
  /** Where the new seed starts. */
  start: { x: number; y: number };
  /** Sets of rows; the page's "Refresh Data" button moves to the next. */
  batches: Row[][];
}

// JSON types widen tuples (axes) and unions (column roles, shapes). The file is
// written by python/random_forest.py and checked by math.test.ts.
export const datasets = [seeds] as unknown as Dataset[];
