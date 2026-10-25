import type { DatasetColumn, ParamRange } from '../../types';
import type { Row } from '../math';

import students from './students.json';

export interface ClassInfo {
  id: string;
  name: string;
  /** A one-word name for the table. */
  short: string;
  shape: 'circle' | 'triangle';
  /** +1 for the positive side of the border, −1 for the other. */
  sign: number;
}

export interface Dataset {
  id: string;
  title: string;
  question: string;
  note: string;
  columns: DatasetColumn[];
  classes: ClassInfo[];
  axes: { x: [number, number]; y: [number, number] };
  /** The C slider, in powers of ten: C = 10^s. */
  logC: ParamRange;
  /** The γ slider, in powers of ten: γ = 10^s. */
  logGamma: ParamRange;
  /** Sets of rows; the page's "Refresh Data" button moves to the next. */
  batches: Row[][];
}

// JSON types widen tuples (axes) and unions (column roles, shapes). The file is
// written by python/support_vector_machine.py and checked by math.test.ts.
export const datasets = [students] as unknown as Dataset[];
