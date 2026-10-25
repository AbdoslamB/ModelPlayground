import type { Dataset, Row } from './data';

import { clamp, snap } from '../../lib/format';
import { niceTop } from '../../lib/scales';
import {
  errorMeter,
  fit,
  flatMse,
  lineThrough,
  mse,
  predict,
  sums,
} from './math';

/** Symbols that can be highlighted across the graph, equation and controls. */
export type SymbolId = 'a' | 'b' | 'error' | 'line';

export type Selection =
  | { kind: 'item'; id: number; source: 'graph' | 'table' }
  | { kind: 'symbol'; id: SymbolId };

/**
 * The Linear Regression Lab's state. Input writes a, b, the data batch, the
 * toggles and the selection; everything else is derived once per change, and
 * the views only draw what is here.
 */
export class LinearRegressionLab {
  readonly datasets: Dataset[];

  datasetId = $state('');
  batchIndex = $state(0);
  a = $state(0);
  b = $state(0);
  showMisses = $state(false);
  showBest = $state(false);
  selection = $state<Selection | null>(null);

  constructor(datasets: Dataset[]) {
    const first = datasets[0];
    if (!first) throw new Error('The Lab needs at least one dataset');
    this.datasets = datasets;
    this.datasetId = first.id;
    const start = this.initialLine;
    this.a = start.a;
    this.b = start.b;
  }

  readonly dataset: Dataset = $derived.by(
    () =>
      this.datasets.find((d) => d.id === this.datasetId) ?? this.datasets[0],
  );
  readonly batchCount = $derived(this.dataset.batches.length);
  readonly rows: Row[] = $derived(
    this.dataset.batches[this.batchIndex] ?? this.dataset.batches[0] ?? [],
  );
  readonly xs = $derived(this.rows.map((r) => r.x));
  readonly ys = $derived(this.rows.map((r) => r.y));
  readonly xColumn = $derived(
    this.dataset.columns.find((c) => c.role === 'x') ?? this.dataset.columns[0],
  );
  readonly yColumn = $derived(
    this.dataset.columns.find((c) => c.role === 'y') ?? this.dataset.columns[1],
  );

  /**
   * Axes for the current set: x is fixed by the dataset; y fits the tallest
   * point, so a slow-growing plant does not sit flat at the bottom. The axes
   * only change with Refresh Data, never under the learner's hand.
   */
  readonly axes = $derived.by(() => {
    const [yMin, yMax] = this.dataset.axes.y;
    const top = Math.min(yMax, niceTop(Math.max(...this.ys) * 1.15));
    return { x: this.dataset.axes.x, y: [yMin, top] as [number, number] };
  });

  readonly sums = $derived(sums(this.xs, this.ys));
  readonly best = $derived(fit(this.sums));
  readonly line = $derived({ a: this.a, b: this.b });
  readonly mse = $derived(mse(this.sums, this.line));
  /** The square root of MSE, in the units of y. */
  readonly typicalMiss = $derived(Math.sqrt(this.mse));
  readonly bestMse = $derived(this.best ? mse(this.sums, this.best) : 0);
  readonly meter = $derived(
    errorMeter(this.mse, this.bestMse, flatMse(this.sums)),
  );
  /** ŷ for every row, by row id. */
  readonly predictions: Readonly<Record<number, number>> = $derived(
    Object.fromEntries(this.rows.map((r) => [r.id, predict(this.line, r.x)])),
  );
  /** e = y − ŷ for every row, by row id. */
  readonly misses: Readonly<Record<number, number>> = $derived(
    Object.fromEntries(
      this.rows.map((r) => [r.id, r.y - predict(this.line, r.x)]),
    ),
  );

  /**
   * Handle positions: 20% and 80% across the x-range of all batches, so the
   * handles stay put when the data changes.
   */
  readonly handleXs = $derived.by(() => {
    const all = this.dataset.batches.flat().map((r) => r.x);
    const min = Math.min(...all);
    const max = Math.max(...all);
    return [min + 0.2 * (max - min), min + 0.8 * (max - min)] as const;
  });

  /**
   * Where the two handles sit right now. Each starts at its fixed x; if the
   * line leaves the visible y-range there, the handle slides along the line
   * to just inside the edge, so it can always be seen and grabbed.
   */
  readonly handles = $derived.by(() => {
    const [lo, hi] = this.axes.y;
    const [left, right] = this.axes.x;
    const pad = 0.04 * (hi - lo);
    const inside = this.handleXs.map((hx) => {
      const y = this.at(hx);
      if ((y >= lo + pad && y <= hi - pad) || this.b === 0) return hx;
      const edge = y > hi - pad ? hi - pad : lo + pad;
      return clamp((edge - this.a) / this.b, left, right);
    });
    let [x0 = 0, x1 = 1] = inside;
    // Keep the two handles apart, so the line between them stays defined.
    const gap = 0.15 * (right - left);
    if (x1 - x0 < gap) {
      if (x1 - gap >= left) x0 = x1 - gap;
      else x1 = x0 + gap;
    }
    return [x0, x1].map((x) => ({ x, y: this.at(x) }));
  });

  readonly selectedRow = $derived(
    this.selection?.kind === 'item'
      ? this.rows.find((r) => r.id === (this.selection?.id ?? -1))
      : undefined,
  );

  readonly highlight = $derived(
    this.selection?.kind === 'symbol' ? this.selection.id : null,
  );

  /** ŷ for any x, on the learner's line. */
  at(x: number): number {
    return predict(this.line, x);
  }

  /** ŷ for any x, on the best line (or NaN if there is none). */
  bestAt(x: number): number {
    return this.best ? predict(this.best, x) : NaN;
  }

  /** Sets the line, clamped to the slider ranges and rounded to their steps. */
  setLine(a: number, b: number, exact = false): void {
    const { a: pa, b: pb } = this.dataset.params;
    const nextA = clamp(a, pa.min, pa.max);
    const nextB = clamp(b, pb.min, pb.max);
    this.a = exact ? nextA : snap(nextA, pa.step);
    this.b = exact ? nextB : snap(nextB, pb.step);
  }

  /** Moves the handle at `handleX` to height `y`, pivoting around `pivotX`. */
  pivot(pivotX: number, pivotY: number, handleX: number, y: number): void {
    const next = lineThrough(pivotX, pivotY, handleX, y);
    this.setLine(next.a, next.b);
  }

  /** The starting line for the current set: flat, at the average y. */
  get initialLine(): { a: number; b: number } {
    const { a } = this.dataset.params;
    const ys = this.ys;
    const mean = ys.reduce((total, y) => total + y, 0) / ys.length;
    return { a: snap(clamp(Math.round(mean), a.min, a.max), a.step), b: 0 };
  }

  /** Moves to the next set of points and starts again from a flat line. */
  nextBatch(): void {
    this.batchIndex = (this.batchIndex + 1) % this.batchCount;
    this.selection = null;
    const start = this.initialLine;
    this.setLine(start.a, start.b);
  }

  select(selection: Selection | null): void {
    this.selection = selection;
  }

  /** Clears the selection only if it is still the one being left. */
  release(kind: Selection['kind'], id: number | SymbolId): void {
    if (this.selection?.kind === kind && this.selection.id === id) {
      this.selection = null;
    }
  }
}
