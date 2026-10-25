import type { Dataset, Row } from './data';
import type { Point } from './math';

import { clamp, snap } from '../../lib/format';
import { assign, distance, inertia, sameCentres, update } from './math';

export type Selection =
  | { kind: 'item'; id: number; source: 'graph' | 'table' }
  | { kind: 'symbol'; id: 'J' };

/** Grid used to shade the area each stand serves. */
export const AREA_GRID = { columns: 50, lines: 50 } as const;

/** Stand names, in order. */
export const STAND_NAMES = ['A', 'B', 'C', 'D'] as const;

/**
 * The k-Means Lab's state. Input writes the stands' positions, k, the data
 * set, the toggles and the selection. Who walks to which stand, where each
 * stand would move next, and the total walk are derived, so dragging a stand
 * regroups everyone at once.
 */
export class KmeansLab {
  readonly dataset: Dataset;

  batchIndex = $state(0);
  k = $state(3);
  centres = $state<Point[]>([]);
  steps = $state(0);
  showLines = $state(true);
  showAreas = $state(false);
  selection = $state<Selection | null>(null);

  constructor(dataset: Dataset) {
    this.dataset = dataset;
    this.k = dataset.startK;
    this.centres = this.startCentres(dataset.startK);
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

  /** Which stand each person walks to: always the nearest. */
  readonly labels = $derived(assign(this.rows, this.centres));
  readonly labelById = $derived(
    Object.fromEntries(this.rows.map((r, i) => [r.id, this.labels[i] ?? 0])),
  );
  /** Where each stand would move on the next step: the middle of its people. */
  readonly next = $derived(update(this.rows, this.labels, this.centres));
  /** True when another step would move nothing. */
  readonly settled = $derived(sameCentres(this.next, this.centres));
  readonly groupSizes = $derived(
    this.centres.map((_, j) => this.labels.filter((l) => l === j).length),
  );
  /** J: the total of every walk, squared. */
  readonly total = $derived(inertia(this.rows, this.labels, this.centres));
  /** The typical walk in metres: √(J / n). */
  readonly typicalWalk = $derived(
    Math.sqrt(this.total / Math.max(1, this.rows.length)),
  );
  /** The typical walk with the stands where they started, for the meter. */
  readonly startWalk = $derived.by(() => {
    const starts = this.startCentres(this.k);
    const labels = assign(this.rows, starts);
    return Math.sqrt(
      inertia(this.rows, labels, starts) / Math.max(1, this.rows.length),
    );
  });
  /** Every person's walk to their own stand, by person id. */
  readonly walks = $derived(
    Object.fromEntries(
      this.rows.map((r, i) => {
        const centre = this.centres[this.labels[i] ?? 0];
        return [r.id, centre ? distance(r, centre) : NaN];
      }),
    ),
  );
  /** The nearest stand for every cell of the chart, only when shown. */
  readonly areas = $derived.by(() => {
    if (!this.showAreas) return [];
    const [x0, x1] = this.dataset.axes.x;
    const [y0, y1] = this.dataset.axes.y;
    const cells: Point[] = [];
    for (let j = 0; j < AREA_GRID.lines; j++) {
      for (let i = 0; i < AREA_GRID.columns; i++) {
        cells.push({
          x: x0 + ((i + 0.5) * (x1 - x0)) / AREA_GRID.columns,
          y: y1 - ((j + 0.5) * (y1 - y0)) / AREA_GRID.lines,
        });
      }
    }
    return assign(cells, this.centres);
  });

  readonly selectedRow = $derived(
    this.selection?.kind === 'item'
      ? this.rows.find((r) => r.id === (this.selection?.id ?? -1))
      : undefined,
  );
  readonly highlight = $derived(
    this.selection?.kind === 'symbol' ? this.selection.id : null,
  );

  /** A person's distance to every stand, in metres. */
  distancesFor(row: Row): number[] {
    return this.centres.map((centre) => distance(row, centre));
  }

  startCentres(k: number): Point[] {
    return this.dataset.starts.slice(0, k).map((s) => ({ ...s }));
  }

  /** Drags stand `index` to (x, y), kept inside the park. */
  setCentre(index: number, x: number, y: number): void {
    const { x: ax, y: ay } = this.dataset.axes;
    this.centres = this.centres.map((c, i) =>
      i === index
        ? {
            x: snap(clamp(x, ax[0], ax[1]), 0.1),
            y: snap(clamp(y, ay[0], ay[1]), 0.1),
          }
        : c,
    );
    this.steps = 0;
  }

  /** One k-Means step: every stand moves to the middle of its people. */
  step(): void {
    if (this.settled) return;
    this.centres = this.next;
    this.steps += 1;
  }

  /** Sets k and starts the stands again from the middle. */
  setK(value: number): void {
    const ks = this.dataset.ks;
    const k = ks.reduce((best, option) =>
      Math.abs(option - value) < Math.abs(best - value) ? option : best,
    );
    if (k === this.k) return;
    this.k = k;
    this.reset();
  }

  reset(): void {
    this.centres = this.startCentres(this.k);
    this.steps = 0;
  }

  nextBatch(): void {
    this.batchIndex = (this.batchIndex + 1) % this.batchCount;
    this.selection = null;
    this.reset();
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
