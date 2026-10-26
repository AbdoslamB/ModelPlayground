export type Category =
  | 'Classification'
  | 'Clustering'
  | 'Dimensionality reduction'
  | 'Experiments'
  | 'Regression'
  | 'Reinforcement learning'
  | 'Sequence models';

/** Sidebar and home page order of the categories. */
export const categories: readonly Category[] = [
  'Regression',
  'Classification',
  'Clustering',
  'Dimensionality reduction',
  'Sequence models',
  'Reinforcement learning',
  'Experiments',
];

export interface ModelMeta {
  slug: string;
  title: string;
  category: Category;
  order: number;
  status: 'coming-soon' | 'ready';
  /** One line; also the page's meta description. */
  summary: string;
}

export interface ParamRange {
  min: number;
  max: number;
  step: number;
  initial: number;
}

export interface DatasetColumn {
  key: string;
  label: string;
  /** Table header text. */
  short: string;
  unit: string;
  role: 'class' | 'id' | 'x' | 'y';
  /** Decimals shown in the table and tooltips. */
  decimals: number;
}

/** Words used to fill the step guides, e.g. "eruption", "wait". */
export interface DatasetWords {
  row: string;
  rows: string;
  x: string;
  y: string;
  /** "minute of eruption": one unit of x, said in words. */
  xStep: string;
}

export interface DatasetMeta<P extends string, R extends string, Row> {
  id: string;
  title: string;
  question: string;
  /** The x value the question asks about; used as the default in the live equation. */
  exampleX: number;
  rowMeaning: string;
  /** Says that the numbers are made up, and what real pattern they follow. */
  note: string;
  columns: DatasetColumn[];
  words: DatasetWords;
  axes: { x: [number, number]; y: [number, number] };
  params: Record<P, ParamRange>;
  thresholds: Record<string, number>;
  /** Small sets of rows; the page's "Refresh Data" button moves to the next. */
  batches: Row[][];
  /** One per batch. Written by python/make_fixtures.py; tests compare against it. */
  reference: Record<R, number>[];
}

export interface EquationSpec {
  id: string;
  /** Static formula, rendered by KaTeX at build time. */
  tex: string;
  /** One-sentence plain-language reading. */
  words: string;
}
