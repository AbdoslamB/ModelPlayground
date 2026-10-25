/**
 * Decision Tree math. Pure functions: no DOM, no state. Every number the
 * learner sees comes from here, and math.test.ts checks the trees against
 * scikit-learn's DecisionTreeClassifier.
 */

export type Feature = 'x' | 'y';

export interface Row {
  id: number;
  x: number;
  y: number;
  label: string;
}

export interface Split {
  feature: Feature;
  /** Rows with feature ≤ threshold go left ("yes"), the rest go right. */
  threshold: number;
}

export interface Box {
  x: readonly [number, number];
  y: readonly [number, number];
}

export interface TreeNode {
  /** "" for the root, then "L" (yes) and "R" (no) for each step down. */
  path: string;
  depth: number;
  rows: Row[];
  /** How many rows of each class, in the order of `classes`. */
  counts: number[];
  gini: number;
  /** The most common class; on a tie, the first. Empty nodes copy their parent. */
  prediction: string;
  /** The part of the chart this node covers. */
  box: Box;
  split?: Split;
  /** How much the split lowers the impurity. */
  gain?: number;
  left?: TreeNode;
  right?: TreeNode;
}

/** How many rows of each class. */
export function classCounts(
  rows: readonly Row[],
  classes: readonly string[],
): number[] {
  return classes.map((c) => rows.filter((r) => r.label === c).length);
}

/**
 * Gini impurity: 1 − Σ pₖ², the chance that two rows picked at random (with
 * replacement) have different classes. 0 when every row has the same class.
 */
export function gini(counts: readonly number[]): number {
  const n = counts.reduce((t, c) => t + c, 0);
  if (n === 0) return 0;
  return 1 - counts.reduce((t, c) => t + (c / n) ** 2, 0);
}

export function partition(rows: readonly Row[], split: Split): [Row[], Row[]] {
  const left: Row[] = [];
  const right: Row[] = [];
  for (const row of rows) {
    (row[split.feature] <= split.threshold ? left : right).push(row);
  }
  return [left, right];
}

/**
 * Information gain with Gini: the parent's impurity minus the children's,
 * each weighted by its share of the rows.
 */
export function gain(
  rows: readonly Row[],
  split: Split,
  classes: readonly string[],
): number {
  if (rows.length === 0) return 0;
  const [left, right] = partition(rows, split);
  const weighted =
    (left.length * gini(classCounts(left, classes)) +
      right.length * gini(classCounts(right, classes))) /
    rows.length;
  return gini(classCounts(rows, classes)) - weighted;
}

/** Thresholds worth trying: halfway between neighbouring distinct values. */
export function candidates(rows: readonly Row[], feature: Feature): number[] {
  const values = [...new Set(rows.map((r) => r[feature]))].sort(
    (a, b) => a - b,
  );
  const halfway: number[] = [];
  let previous: number | null = null;
  for (const value of values) {
    if (previous !== null) halfway.push((previous + value) / 2);
    previous = value;
  }
  return halfway;
}

/**
 * The split with the highest gain. Features are tried in the order given
 * and thresholds from low to high; only a strictly better gain replaces the
 * one found so far. Null when no split is possible.
 */
export function bestSplit(
  rows: readonly Row[],
  classes: readonly string[],
  features: readonly Feature[] = ['x', 'y'],
): { split: Split; gain: number } | null {
  let best: { split: Split; gain: number } | null = null;
  for (const feature of features) {
    for (const threshold of candidates(rows, feature)) {
      const split = { feature, threshold };
      const g = gain(rows, split, classes);
      if (!best || g > best.gain + 1e-12) best = { split, gain: g };
    }
  }
  return best;
}

/**
 * Grows a tree: each node with mixed classes and depth below `maxDepth`
 * takes its best split (or the one in `chosen` for its path), and its two
 * halves grow the same way.
 */
export function grow(
  rows: readonly Row[],
  classes: readonly string[],
  maxDepth: number,
  box: Box,
  chosen: Readonly<Record<string, Split>> = {},
  path = '',
  fallback = classes[0] ?? '',
): TreeNode {
  const counts = classCounts(rows, classes);
  const most = Math.max(...counts);
  const node: TreeNode = {
    path,
    depth: path.length,
    rows: [...rows],
    counts,
    gini: gini(counts),
    prediction:
      rows.length === 0 ? fallback : (classes[counts.indexOf(most)] ?? ''),
    box,
  };
  if (node.depth >= maxDepth || node.gini === 0) return node;
  const split = chosen[path] ?? bestSplit(rows, classes)?.split;
  if (!split) return node;
  const [left, right] = partition(rows, split);
  const [lo, hi] = box[split.feature];
  const t = split.threshold;
  node.split = split;
  node.gain = gain(rows, split, classes);
  node.left = grow(
    left,
    classes,
    maxDepth,
    { ...box, [split.feature]: [lo, Math.min(hi, Math.max(lo, t))] },
    chosen,
    `${path}L`,
    node.prediction,
  );
  node.right = grow(
    right,
    classes,
    maxDepth,
    { ...box, [split.feature]: [Math.max(lo, Math.min(hi, t)), hi] },
    chosen,
    `${path}R`,
    node.prediction,
  );
  return node;
}

/** Every node, parents before children, "yes" sides first. */
export function allNodes(node: TreeNode): TreeNode[] {
  return [
    node,
    ...(node.left ? allNodes(node.left) : []),
    ...(node.right ? allNodes(node.right) : []),
  ];
}

/** The leaves, left to right. */
export function leaves(node: TreeNode): TreeNode[] {
  return allNodes(node).filter((n) => !n.split);
}

/** The node at a path, or undefined if the tree does not reach it. */
export function nodeAt(tree: TreeNode, path: string): TreeNode | undefined {
  let node: TreeNode | undefined = tree;
  for (const step of path) node = step === 'L' ? node?.left : node?.right;
  return node;
}

/** The leaf a point lands in, following the questions from the root. */
export function leafFor(
  tree: TreeNode,
  point: { x: number; y: number },
): TreeNode {
  let node = tree;
  while (node.split && node.left && node.right) {
    node =
      point[node.split.feature] <= node.split.threshold
        ? node.left
        : node.right;
  }
  return node;
}

/** How many rows the tree labels right. */
export function rightCount(tree: TreeNode, rows: readonly Row[]): number {
  return rows.filter((r) => leafFor(tree, r).prediction === r.label).length;
}

/** The leaves' Gini, each weighted by its share of the rows. */
export function leafImpurity(tree: TreeNode): number {
  const n = tree.rows.length;
  if (n === 0) return 0;
  return leaves(tree).reduce(
    (t, leaf) => t + (leaf.rows.length / n) * leaf.gini,
    0,
  );
}
