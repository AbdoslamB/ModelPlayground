import type { ClassInfo, Dataset } from './data';
import type { Row, Tree } from './math';

import { clamp, snap } from '../../lib/format';
import { leafFor, makeForest, outOfBag, tally, voteGrid } from './math';

export type Selection =
  | { kind: 'item'; id: number; source: 'graph' | 'table' }
  | { kind: 'symbol'; id: 'T' };

/** Grid used to shade the forest's vote over the chart. */
export const AREA_GRID = { columns: 40, lines: 40 } as const;

/**
 * The Random Forest Lab's state. Input writes the number of trees, the
 * forest's seed, the new seed's position, the data set, the toggle and the
 * selection (a tree). The trees, their votes and the scores are derived.
 */
export class ForestLab {
  readonly dataset: Dataset;
  readonly classes: string[];

  batchIndex = $state(0);
  size = $state(9);
  forestSeed = $state(1);
  query = $state({ x: 0, y: 0 });
  showAreas = $state(true);
  selection = $state<Selection | null>(null);

  constructor(dataset: Dataset) {
    this.dataset = dataset;
    this.classes = dataset.classes.map((c) => c.id);
    this.size = dataset.trees.initial;
    this.query = { ...dataset.start };
  }

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

  /** Every tree the slider can reach; a tree never depends on the count. */
  readonly allTrees: Tree[] = $derived.by(() =>
    makeForest(
      this.rows,
      this.classes,
      this.dataset.maxDepth,
      this.dataset.axes,
      this.forestSeed,
      this.dataset.trees.max,
    ),
  );
  readonly trees = $derived(this.allTrees.slice(0, this.size));
  readonly tally = $derived.by(() =>
    tally(this.trees, this.classes, this.query),
  );
  readonly prediction = $derived(this.tally.winner);
  /** What each tree says about the new seed, by tree id. */
  readonly votes: Record<number, string> = $derived(
    Object.fromEntries(
      this.trees.map((t) => [t.id, leafFor(t.root, this.query).prediction]),
    ),
  );
  readonly outOfBag = $derived.by(() =>
    outOfBag(this.rows, this.trees, this.classes),
  );
  /** The share of trees voting for the second kind, cell by cell. */
  readonly areas = $derived.by(() =>
    this.showAreas
      ? voteGrid(
          this.trees,
          this.classes,
          this.dataset.axes,
          AREA_GRID.columns,
          AREA_GRID.lines,
        )
      : [],
  );

  readonly selectedTree = $derived(
    this.selection?.kind === 'item'
      ? this.trees.find((t) => t.id === (this.selection?.id ?? -1))
      : undefined,
  );
  /** How many times the selected tree drew each row, by row id. */
  readonly draws: Record<number, number> = $derived.by(() => {
    const counts: Record<number, number> = {};
    for (const i of this.selectedTree?.sample ?? []) {
      const row = this.rows[i];
      if (row) counts[row.id] = (counts[row.id] ?? 0) + 1;
    }
    return counts;
  });
  readonly highlight = $derived(
    this.selection?.kind === 'symbol' ? this.selection.id : null,
  );

  classInfo(id: string): ClassInfo | undefined {
    return this.dataset.classes.find((c) => c.id === id);
  }

  /** Class index for colors: 1 for the first class, 2 for the second. */
  classIndex(id: string): number {
    return this.classes.indexOf(id) + 1;
  }

  /** Moves the new seed, kept inside the chart and rounded to 0.5. */
  setQuery(x: number, y: number): void {
    const { x: ax, y: ay } = this.dataset.axes;
    this.query = {
      x: snap(clamp(x, ax[0], ax[1]), 0.5),
      y: snap(clamp(y, ay[0], ay[1]), 0.5),
    };
  }

  /** Sets the number of trees to the nearest odd value. */
  setSize(value: number): void {
    const { min, max, step } = this.dataset.trees;
    this.size = clamp(min + Math.round((value - min) / step) * step, min, max);
    if (this.selectedTree === undefined && this.selection?.kind === 'item') {
      this.selection = null;
    }
  }

  /** Grows a new forest: new samples and new random questions. */
  newForest(): void {
    this.forestSeed += 1;
  }

  reset(): void {
    this.query = { ...this.dataset.start };
    this.size = this.dataset.trees.initial;
    this.forestSeed = 1;
  }

  nextBatch(): void {
    this.batchIndex = (this.batchIndex + 1) % this.dataset.batches.length;
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
