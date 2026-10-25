/**
 * k-Nearest Neighbors math. Pure functions: no DOM, no state. Every number
 * the learner sees comes from here, and math.test.ts checks the predictions
 * against scikit-learn.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Labelled extends Point {
  id: number;
  label: string;
}

export interface Ranked<R extends Labelled> {
  row: R;
  /** Straight-line distance to the query. */
  distance: number;
  /** 1 for the nearest row, 2 for the next, and so on. */
  rank: number;
}

/** Straight-line (Euclidean) distance: √((x₁ − q₁)² + (y₁ − q₂)²). */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Every row with its distance to the query, nearest first. Equal distances
 * are ordered by id, so the result never depends on the order of the rows.
 */
export function rankByDistance<R extends Labelled>(
  rows: readonly R[],
  query: Point,
): Ranked<R>[] {
  return rows
    .map((row) => ({ row, distance: distance(row, query) }))
    .sort((p, q) => p.distance - q.distance || p.row.id - q.row.id)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export interface Vote {
  /** How many of the k nearest rows have each label. */
  counts: Record<string, number>;
  /** The label with the most votes; on a tie, the label of the nearest row. */
  winner: string;
}

/** The k nearest rows vote with their labels; the majority wins. */
export function vote<R extends Labelled>(
  ranked: readonly Ranked<R>[],
  k: number,
): Vote {
  const voters = ranked.slice(0, k);
  const counts: Record<string, number> = {};
  for (const { row } of voters)
    counts[row.label] = (counts[row.label] ?? 0) + 1;
  let winner = '';
  let best = -1;
  // Voters are nearest first, so on a tie the nearer label is kept.
  for (const { row } of voters) {
    const count = counts[row.label];
    if (count > best) {
      best = count;
      winner = row.label;
    }
  }
  return { counts, winner };
}

/** The label k-NN gives a query point. */
export function classify(
  rows: readonly Labelled[],
  query: Point,
  k: number,
): string {
  return vote(rankByDistance(rows, query), k).winner;
}

/**
 * How many rows are guessed right when each one is hidden in turn and its k
 * nearest other rows vote. An honest score: no row votes for itself.
 */
export function leaveOneOut(rows: readonly Labelled[], k: number): number {
  let right = 0;
  for (const row of rows) {
    const others = rows.filter((other) => other.id !== row.id);
    if (classify(others, row, k) === row.label) right += 1;
  }
  return right;
}

/**
 * The label of every cell in a grid over the chart, for shading the areas
 * each label would win. Cells are listed row by row, top to bottom.
 */
export function labelGrid(
  rows: readonly Labelled[],
  k: number,
  bounds: { x: readonly [number, number]; y: readonly [number, number] },
  columns: number,
  lines: number,
): string[] {
  const [x0, x1] = bounds.x;
  const [y0, y1] = bounds.y;
  const cellW = (x1 - x0) / columns;
  const cellH = (y1 - y0) / lines;
  const labels: string[] = [];
  for (let j = 0; j < lines; j++) {
    for (let i = 0; i < columns; i++) {
      const centre = { x: x0 + (i + 0.5) * cellW, y: y1 - (j + 0.5) * cellH };
      labels.push(classify(rows, centre, k));
    }
  }
  return labels;
}
