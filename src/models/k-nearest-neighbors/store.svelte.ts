import type { ClassInfo, Dataset, Row } from './data';

import { clamp, snap } from '../../lib/format';
import { labelGrid, leaveOneOut, rankByDistance, vote } from './math';

export type Selection =
  | { kind: 'item'; id: number; source: 'graph' | 'table' }
  | { kind: 'symbol'; id: 'd' | 'k' };

/** Grid used to shade the areas each kind of fruit would win. */
export const AREA_GRID = { columns: 56, lines: 56 } as const;

/**
 * The k-Nearest Neighbors Lab's state. Input writes the new fruit's position,
 * k, the data set, the toggle and the selection; everything else is derived,
 * and the views only draw what is here.
 */
export class KnnLab {
  readonly dataset: Dataset;

  batchIndex = $state(0);
  k = $state(3);
  query = $state({ x: 0, y: 0 });
  showAreas = $state(false);
  selection = $state<Selection | null>(null);

  constructor(dataset: Dataset) {
    this.dataset = dataset;
    this.k = dataset.startK;
    this.query = { ...dataset.start };
  }

  readonly batchCount = $derived.by(() => this.dataset.batches.length);
  readonly rows: Row[] = $derived.by(
    () =>
      this.dataset.batches[this.batchIndex] ?? this.dataset.batches[0] ?? [],
  );
  readonly xColumn = $derived.by(
    () =>
      this.dataset.columns.find((c) => c.role === 'x') ??
      this.dataset.columns[0],
  );
  readonly yColumn = $derived.by(
    () =>
      this.dataset.columns.find((c) => c.role === 'y') ??
      this.dataset.columns[1],
  );

  /** Every fruit with its distance to the new one, nearest first. */
  readonly ranked = $derived(rankByDistance(this.rows, this.query));
  readonly voters = $derived(this.ranked.slice(0, this.k));
  readonly vote = $derived(vote(this.ranked, this.k));
  readonly prediction = $derived(this.vote.winner);
  /** Distance to the k-th nearest fruit: the radius of the neighbourhood. */
  readonly radius = $derived(this.voters.at(-1)?.distance ?? 0);
  readonly rankById = $derived(
    Object.fromEntries(this.ranked.map((r) => [r.row.id, r])),
  );
  /** Fruits guessed right when each is hidden and its neighbours vote. */
  readonly score = $derived(leaveOneOut(this.rows, this.k));
  /** The winning kind for every cell of the chart, only when shown. */
  readonly areas = $derived.by(() =>
    this.showAreas
      ? labelGrid(
          this.rows,
          this.k,
          this.dataset.axes,
          AREA_GRID.columns,
          AREA_GRID.lines,
        )
      : [],
  );

  readonly selectedRow = $derived(
    this.selection?.kind === 'item'
      ? this.rows.find((r) => r.id === (this.selection?.id ?? -1))
      : undefined,
  );
  readonly highlight = $derived(
    this.selection?.kind === 'symbol' ? this.selection.id : null,
  );

  classInfo(id: string): ClassInfo | undefined {
    return this.dataset.classes.find((c) => c.id === id);
  }

  /** Class index for colors: 1 for the first class, 2 for the second. */
  classIndex(id: string): number {
    return this.dataset.classes.findIndex((c) => c.id === id) + 1;
  }

  /** Moves the new fruit, kept inside the chart and rounded to 0.1 cm. */
  setQuery(x: number, y: number): void {
    const { x: ax, y: ay } = this.dataset.axes;
    this.query = {
      x: snap(clamp(x, ax[0], ax[1]), 0.1),
      y: snap(clamp(y, ay[0], ay[1]), 0.1),
    };
  }

  /** Sets k to the nearest allowed (odd) value. */
  setK(value: number): void {
    const ks = this.dataset.ks;
    this.k = ks.reduce((best, k) =>
      Math.abs(k - value) < Math.abs(best - value) ? k : best,
    );
  }

  resetQuery(): void {
    this.query = { ...this.dataset.start };
  }

  nextBatch(): void {
    this.batchIndex = (this.batchIndex + 1) % this.batchCount;
    this.selection = null;
  }

  select(selection: Selection | null): void {
    this.selection = selection;
  }

  release(kind: Selection['kind'], id: number | string): void {
    if (this.selection?.kind === kind && this.selection.id === id) {
      this.selection = null;
    }
  }
}
