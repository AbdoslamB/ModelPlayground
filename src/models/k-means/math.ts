/**
 * k-Means math. Pure functions: no DOM, no state. Every number the learner
 * sees comes from here, and math.test.ts checks the results against
 * scikit-learn, starting from the same stands.
 */

export interface Point {
  x: number;
  y: number;
}

/** Squared straight-line distance. k-Means adds these up. */
export function squaredDistance(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

/** Straight-line distance, for showing walks in metres. */
export function distance(a: Point, b: Point): number {
  return Math.sqrt(squaredDistance(a, b));
}

/**
 * For every point, the index of its nearest centre. On an exact tie the
 * lower index wins, so the result never depends on luck.
 */
export function assign(
  points: readonly Point[],
  centres: readonly Point[],
): number[] {
  return points.map((point) => {
    let best = 0;
    let bestDistance = Infinity;
    centres.forEach((centre, index) => {
      const d = squaredDistance(point, centre);
      if (d < bestDistance) {
        best = index;
        bestDistance = d;
      }
    });
    return best;
  });
}

/**
 * Every centre moved to the average position of its points. A centre with
 * no points stays where it is.
 */
export function update(
  points: readonly Point[],
  labels: readonly number[],
  centres: readonly Point[],
): Point[] {
  return centres.map((centre, index) => {
    let x = 0;
    let y = 0;
    let count = 0;
    points.forEach((point, i) => {
      if (labels[i] === index) {
        x += point.x;
        y += point.y;
        count += 1;
      }
    });
    return count === 0 ? { ...centre } : { x: x / count, y: y / count };
  });
}

/**
 * J: the sum of squared distances from every point to its own centre. This
 * is what k-Means makes smaller with every step.
 */
export function inertia(
  points: readonly Point[],
  labels: readonly number[],
  centres: readonly Point[],
): number {
  return points.reduce((total, point, i) => {
    const centre = centres[labels[i] ?? 0];
    return centre ? total + squaredDistance(point, centre) : total;
  }, 0);
}

/** True when no centre moves by more than `tolerance`. */
export function sameCentres(
  a: readonly Point[],
  b: readonly Point[],
  tolerance = 1e-9,
): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => {
      const q = b[i];
      return (
        q !== undefined &&
        Math.abs(p.x - q.x) <= tolerance &&
        Math.abs(p.y - q.y) <= tolerance
      );
    })
  );
}

/**
 * Runs k-Means from the given centres until nothing moves: assign, move,
 * repeat. Returns the final centres, groups, and how many moves it took.
 */
export function run(
  points: readonly Point[],
  starts: readonly Point[],
  maxSteps = 100,
): { centres: Point[]; labels: number[]; steps: number } {
  let centres = starts.map((c) => ({ ...c }));
  let steps = 0;
  for (; steps < maxSteps; steps++) {
    const moved = update(points, assign(points, centres), centres);
    if (sameCentres(moved, centres)) break;
    centres = moved;
  }
  return { centres, labels: assign(points, centres), steps };
}
