import type { ClassInfo, Dataset } from './data';
import type { Feature, Row, Split, TreeNode } from './math';

import { clamp, snap } from '../../lib/format';
import {
  allNodes,
  bestSplit,
  grow,
  leafFor,
  leafImpurity,
  leaves,
  nodeAt,
  rightCount,
} from './math';

export type Selection =
  | { kind: 'item'; id: number; source: 'graph' | 'table' }
  | { kind: 'symbol'; id: 'depth' | 'G' };

/** How finely a dragged threshold moves, in data units. */
export const THRESHOLD_STEP = 0.5;

/**
 * The Decision Tree Lab's state. Input writes the depth limit, the splits the
 * learner chose by hand, the node in focus, the data set and the selection.
 * The tree grows from those: every other node takes its best split.
 */
export class TreeLab {
  readonly dataset: Dataset;
  readonly classes: string[];

  batchIndex = $state(0);
  depth = $state(2);
  showAreas = $state(true);
  /** Splits chosen by hand, by node path. */
  chosen = $state<Record<string, Split>>({});
  /** The path of the node in focus: its split can be moved. */
  focus = $state('');
  selection = $state<Selection | null>(null);

  constructor(dataset: Dataset) {
    this.dataset = dataset;
    this.classes = dataset.classes.map((c) => c.id);
    this.depth = dataset.depths.initial;
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

  readonly tree: TreeNode = $derived.by(() =>
    grow(this.rows, this.classes, this.depth, this.dataset.axes, this.chosen),
  );
  readonly nodes = $derived(allNodes(this.tree));
  readonly leaves = $derived(leaves(this.tree));
  /** The node in focus, or its nearest ancestor if the tree got shallower. */
  readonly focusNode: TreeNode = $derived.by(() => {
    for (let path = this.focus; ; path = path.slice(0, -1)) {
      const node = nodeAt(this.tree, path);
      if (node) return node;
    }
  });
  /** For the node in focus: the best split on each feature. */
  readonly options = $derived(
    (['x', 'y'] as const).map((feature) => ({
      feature,
      best: bestSplit(this.focusNode.rows, this.classes, [feature]),
    })),
  );
  /** Can the node in focus be split at all? */
  readonly canSplit = $derived(
    this.focusNode.depth < this.depth && this.focusNode.gini > 0,
  );
  readonly right = $derived(rightCount(this.tree, this.rows));
  readonly impurity = $derived(leafImpurity(this.tree));
  /** Each leaf's number, 1 from the left, by path. */
  readonly leafNumber: Record<string, number> = $derived(
    Object.fromEntries(this.leaves.map((leaf, i) => [leaf.path, i + 1])),
  );
  /** The leaf each day lands in, by row id. */
  readonly leafById: Record<number, TreeNode> = $derived(
    Object.fromEntries(this.rows.map((r) => [r.id, leafFor(this.tree, r)])),
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
    return this.classes.indexOf(id) + 1;
  }

  focusOn(path: string): void {
    this.focus = path;
  }

  /** Moves the split of the node in focus, kept inside the node's box. */
  setThreshold(value: number): void {
    const split = this.focusNode.split;
    if (!split) return;
    const [lo, hi] = this.focusNode.box[split.feature];
    this.chosen = {
      ...this.chosen,
      [this.focusNode.path]: {
        feature: split.feature,
        threshold: snap(clamp(value, lo, hi), THRESHOLD_STEP),
      },
    };
  }

  /** Splits the node in focus on a feature, at that feature's best place. */
  chooseFeature(feature: Feature): void {
    const best = this.options.find((o) => o.feature === feature)?.best;
    if (!best || !this.canSplit) return;
    this.chosen = { ...this.chosen, [this.focusNode.path]: best.split };
  }

  setDepth(value: number): void {
    const { min, max } = this.dataset.depths;
    this.depth = Math.round(clamp(value, min, max));
  }

  reset(): void {
    this.chosen = {};
    this.focus = '';
    this.depth = this.dataset.depths.initial;
  }

  nextBatch(): void {
    this.batchIndex = (this.batchIndex + 1) % this.dataset.batches.length;
    this.chosen = {};
    this.focus = '';
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
