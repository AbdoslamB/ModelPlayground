import type { ClassInfo, Dataset } from './data';
import type { Grid, Kernel, Row } from './math';

import { clamp, snap } from '../../lib/format';
import {
  contour,
  decide,
  marginWidth,
  objective,
  sampleGrid,
  slack,
  supportVectors,
  train,
  weights,
} from './math';

export type Selection =
  | { kind: 'item'; id: number; source: 'graph' | 'table' }
  | { kind: 'symbol'; id: 'C' | 'f' | 'gamma' | 'xi' };

/** Cells across and up, for shading the sides and tracing the lines. */
export const GRID_SIZE = 48;

/**
 * The SVM Lab's state. Input writes the students' positions (they can be
 * dragged), C, γ, the kind of border, the data set, the toggles and the
 * selection. The machine is retrained from them whenever any of them change.
 */
export class SvmLab {
  readonly dataset: Dataset;

  batchIndex = $state(0);
  points = $state<Row[]>([]);
  curved = $state(false);
  logC = $state(0);
  logGamma = $state(0);
  showAreas = $state(true);
  selection = $state<Selection | null>(null);

  constructor(dataset: Dataset) {
    this.dataset = dataset;
    this.logC = dataset.logC.initial;
    this.logGamma = dataset.logGamma.initial;
    this.points = this.batch(0);
  }

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

  readonly C = $derived(10 ** this.logC);
  readonly gamma = $derived(10 ** this.logGamma);
  readonly kernel: Kernel = $derived(
    this.curved ? { type: 'rbf', gamma: this.gamma } : { type: 'linear' },
  );
  readonly signs = $derived.by(() =>
    this.points.map((p) => this.classInfo(p.label)?.sign ?? 1),
  );
  readonly machine = $derived.by(() =>
    train(this.points, this.signs, this.C, this.kernel),
  );
  /** f(x) for every student, by id. */
  readonly values: Record<number, number> = $derived(
    Object.fromEntries(this.points.map((p) => [p.id, decide(this.machine, p)])),
  );
  /** y·f(x): 1 or more means on the right side, outside the margin. */
  readonly margins: Record<number, number> = $derived(
    Object.fromEntries(
      this.points.map((p, i) => [
        p.id,
        (this.signs[i] ?? 1) * (this.values[p.id] ?? 0),
      ]),
    ),
  );
  readonly slacks: Record<number, number> = $derived(
    Object.fromEntries(
      this.points.map((p) => [p.id, slack(1, this.margins[p.id] ?? 0)]),
    ),
  );
  readonly supportIds: number[] = $derived(
    supportVectors(this.machine).map((i) => this.points[i]?.id ?? -1),
  );
  readonly w = $derived(weights(this.machine));
  readonly width = $derived(marginWidth(this.w));
  readonly objective = $derived(objective(this.machine, this.C));
  readonly wrong = $derived(
    this.points.filter((p) => (this.margins[p.id] ?? 0) < 0).length,
  );

  readonly grid: Grid = $derived.by(() => ({
    x: this.dataset.axes.x,
    y: this.dataset.axes.y,
    columns: GRID_SIZE,
    lines: GRID_SIZE,
  }));
  readonly samples = $derived(sampleGrid(this.machine, this.grid));
  readonly border = $derived(contour(this.samples, this.grid, 0));
  readonly marginPlus = $derived(contour(this.samples, this.grid, 1));
  readonly marginMinus = $derived(contour(this.samples, this.grid, -1));

  readonly selectedRow = $derived(
    this.selection?.kind === 'item'
      ? this.points.find((r) => r.id === (this.selection?.id ?? -1))
      : undefined,
  );
  readonly highlight = $derived(
    this.selection?.kind === 'symbol' ? this.selection.id : null,
  );

  batch(index: number): Row[] {
    return (this.dataset.batches[index] ?? []).map((r) => ({ ...r }));
  }

  classInfo(id: string): ClassInfo | undefined {
    return this.dataset.classes.find((c) => c.id === id);
  }

  /** Class index for colors: 1 for the first class, 2 for the second. */
  classIndex(id: string): number {
    return this.dataset.classes.findIndex((c) => c.id === id) + 1;
  }

  /** Moves a student, kept inside the chart and rounded to 0.1 h. */
  movePoint(id: number, x: number, y: number): void {
    const { x: ax, y: ay } = this.dataset.axes;
    this.points = this.points.map((p) =>
      p.id === id
        ? {
            ...p,
            x: snap(clamp(x, ax[0], ax[1]), 0.1),
            y: snap(clamp(y, ay[0], ay[1]), 0.1),
          }
        : p,
    );
  }

  setLogC(value: number): void {
    const { min, max, step } = this.dataset.logC;
    this.logC = snap(clamp(value, min, max), step);
  }

  setLogGamma(value: number): void {
    const { min, max, step } = this.dataset.logGamma;
    this.logGamma = snap(clamp(value, min, max), step);
  }

  reset(): void {
    this.points = this.batch(this.batchIndex);
    this.logC = this.dataset.logC.initial;
    this.logGamma = this.dataset.logGamma.initial;
    this.curved = false;
  }

  nextBatch(): void {
    this.batchIndex = (this.batchIndex + 1) % this.dataset.batches.length;
    this.points = this.batch(this.batchIndex);
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
