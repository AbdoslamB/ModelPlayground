/**
 * Random Forest math. Pure functions: no DOM, no state. Every number the
 * learner sees comes from here. The randomness comes from mulberry32, the
 * same generator python/random_forest.py uses, so math.test.ts can check the
 * forests against its fixtures, whose every question scikit-learn agrees with.
 */
import { mulberry32 } from '../../lib/rng';

export type Feature = 'x' | 'y';

export interface Row {
  id: number;
  x: number;
  y: number;
  label: string;
}

export interface Box {
  x: readonly [number, number];
  y: readonly [number, number];
}

export interface TreeNode {
  /** "" for the root, then "L" (yes) and "R" (no) for each step down. */
  path: string;
  /** The most common class among the node's rows; on a tie, the first. */
  prediction: string;
  box: Box;
  feature?: Feature;
  /** Rows with feature ≤ threshold go left ("yes"). */
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

export interface Tree {
  /** 1 for the first tree. */
  id: number;
  /** The row indexes drawn, with replacement: one draw per row. */
  sample: number[];
  root: TreeNode;
}

/** Gini impurity of a list of labels: 1 − Σ pₖ². */
export function gini(labels: readonly string[]): number {
  if (labels.length === 0) return 0;
  const counts: Record<string, number> = {};
  for (const label of labels) counts[label] = (counts[label] ?? 0) + 1;
  return (
    1 - Object.values(counts).reduce((t, c) => t + (c / labels.length) ** 2, 0)
  );
}

/**
 * The best threshold on one feature: halfway between neighbouring distinct
 * values, low to high, a strictly better gain wins. Null if all values match.
 */
export function bestThreshold(
  rows: readonly Row[],
  feature: Feature,
): { threshold: number; gain: number } | null {
  const values = [...new Set(rows.map((r) => r[feature]))].sort(
    (a, b) => a - b,
  );
  const parent = gini(rows.map((r) => r.label));
  let best: { threshold: number; gain: number } | null = null;
  let previous: number | null = null;
  for (const value of values) {
    if (previous !== null) {
      const threshold = (previous + value) / 2;
      const left = rows.filter((r) => r[feature] <= threshold);
      const right = rows.filter((r) => r[feature] > threshold);
      const gain =
        parent -
        (left.length * gini(left.map((r) => r.label)) +
          right.length * gini(right.map((r) => r.label))) /
          rows.length;
      if (!best || gain > best.gain + 1e-12) best = { threshold, gain };
    }
    previous = value;
  }
  return best;
}

function majority(rows: readonly Row[], classes: readonly string[]): string {
  const counts = classes.map((c) => rows.filter((r) => r.label === c).length);
  return classes[counts.indexOf(Math.max(...counts))] ?? '';
}

/**
 * Grows one tree on its sample. Each question uses one feature picked at
 * random (the other if the first cannot split), at its best threshold.
 */
export function growTree(
  rows: readonly Row[],
  classes: readonly string[],
  maxDepth: number,
  box: Box,
  random: () => number,
  path = '',
): TreeNode {
  const node: TreeNode = { path, prediction: majority(rows, classes), box };
  if (path.length >= maxDepth || gini(rows.map((r) => r.label)) === 0) {
    return node;
  }
  const first: Feature = random() < 0.5 ? 'x' : 'y';
  const second: Feature = first === 'x' ? 'y' : 'x';
  let feature = first;
  let found = bestThreshold(rows, first);
  if (!found) {
    feature = second;
    found = bestThreshold(rows, second);
  }
  if (!found) return node;
  const t = found.threshold;
  const [lo, hi] = box[feature];
  node.feature = feature;
  node.threshold = t;
  node.left = growTree(
    rows.filter((r) => r[feature] <= t),
    classes,
    maxDepth,
    { ...box, [feature]: [lo, Math.min(hi, t)] },
    random,
    `${path}L`,
  );
  node.right = growTree(
    rows.filter((r) => r[feature] > t),
    classes,
    maxDepth,
    { ...box, [feature]: [Math.max(lo, t), hi] },
    random,
    `${path}R`,
  );
  return node;
}

/** The seed of tree `index` (from 0) in the forest grown from `forestSeed`. */
export function treeSeed(forestSeed: number, index: number): number {
  return forestSeed * 1000 + index;
}

/**
 * Tree `index` of a forest: a bootstrap sample (n draws with replacement),
 * then a tree grown on it, all from the tree's own seed. A tree never
 * depends on how many other trees there are.
 */
export function makeTree(
  rows: readonly Row[],
  classes: readonly string[],
  maxDepth: number,
  box: Box,
  forestSeed: number,
  index: number,
): Tree {
  const random = mulberry32(treeSeed(forestSeed, index));
  const sample = rows.map(() => Math.floor(random() * rows.length));
  const drawn = sample
    .map((i) => rows[i])
    .filter((row): row is Row => row !== undefined);
  return {
    id: index + 1,
    sample,
    root: growTree(drawn, classes, maxDepth, box, random),
  };
}

export function makeForest(
  rows: readonly Row[],
  classes: readonly string[],
  maxDepth: number,
  box: Box,
  forestSeed: number,
  size: number,
): Tree[] {
  return Array.from({ length: size }, (_, i) =>
    makeTree(rows, classes, maxDepth, box, forestSeed, i),
  );
}

/** The leaf a point lands in. */
export function leafFor(
  node: TreeNode,
  point: { x: number; y: number },
): TreeNode {
  let at = node;
  while (at.feature && at.threshold !== undefined && at.left && at.right) {
    at = point[at.feature] <= at.threshold ? at.left : at.right;
  }
  return at;
}

/** The leaves of a tree, left to right. */
export function leaves(node: TreeNode): TreeNode[] {
  return node.left && node.right
    ? [...leaves(node.left), ...leaves(node.right)]
    : [node];
}

/** How many questions a tree asks in all. */
export function questionCount(node: TreeNode): number {
  return leaves(node).length - 1;
}

export interface Tally {
  /** Votes for each class, in the order of `classes`. */
  counts: number[];
  /** The class with the most votes; on a tie, the first. */
  winner: string;
}

/** Every tree votes for a point; the most votes wins. */
export function tally(
  trees: readonly Tree[],
  classes: readonly string[],
  point: { x: number; y: number },
): Tally {
  const votes = trees.map((tree) => leafFor(tree.root, point).prediction);
  const counts = classes.map((c) => votes.filter((v) => v === c).length);
  return {
    counts,
    winner: classes[counts.indexOf(Math.max(...counts))] ?? '',
  };
}

/** How many different rows a tree saw, and how many it never saw. */
export function coverage(
  tree: Tree,
  rowCount: number,
): {
  seen: number;
  left: number;
} {
  const seen = new Set(tree.sample).size;
  return { seen, left: rowCount - seen };
}

/**
 * The out-of-bag score: each row is judged only by the trees that never saw
 * it. Rows every tree saw are not judged.
 */
export function outOfBag(
  rows: readonly Row[],
  trees: readonly Tree[],
  classes: readonly string[],
): { right: number; judged: number } {
  let right = 0;
  let judged = 0;
  rows.forEach((row, i) => {
    const unseen = trees.filter((t) => !t.sample.includes(i));
    if (unseen.length === 0) return;
    judged += 1;
    if (tally(unseen, classes, row).winner === row.label) right += 1;
  });
  return { right, judged };
}

/**
 * The share of trees voting for the second class, for every cell of a grid
 * over the chart (row by row, top to bottom). 0 or 1 when all agree.
 */
export function voteGrid(
  trees: readonly Tree[],
  classes: readonly string[],
  box: Box,
  columns: number,
  lines: number,
): number[] {
  const [x0, x1] = box.x;
  const [y0, y1] = box.y;
  const shares: number[] = [];
  for (let j = 0; j < lines; j++) {
    for (let i = 0; i < columns; i++) {
      const point = {
        x: x0 + ((i + 0.5) * (x1 - x0)) / columns,
        y: y1 - ((j + 0.5) * (y1 - y0)) / lines,
      };
      const second = trees.filter(
        (tree) => leafFor(tree.root, point).prediction === classes[1],
      ).length;
      shares.push(trees.length ? second / trees.length : 0);
    }
  }
  return shares;
}
