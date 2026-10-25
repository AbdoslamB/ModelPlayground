/**
 * t-SNE math. Pure functions: no DOM, no state. Every number the learner
 * sees comes from here. This is exact t-SNE as scikit-learn runs it: the
 * same perplexity search, the same joint probabilities, the same KL cost and
 * gradient, and the same optimiser. math.test.ts checks each piece against
 * scikit-learn's own code (python/t_sne.py).
 */

/** The smallest probability used, so logs stay finite (numpy's float eps). */
export const EPSILON = 2.220446049250313e-16;

export type Map2D = [number, number][];

/** Squared straight-line distances between every pair of rows. */
export function squaredDistances(
  X: readonly (readonly number[])[],
): number[][] {
  return X.map((a) =>
    X.map((b) => a.reduce((t, v, k) => t + (v - b[k]) ** 2, 0)),
  );
}

/**
 * p(j | i): how likely point i is to pick j as its neighbour, with a
 * Gaussian whose width is searched so that each row has the given
 * perplexity (roughly: how many neighbours each point pays attention to).
 * Returns the probabilities and each row's precision β = 1 / (2σ²).
 */
export function conditionalP(
  D: readonly (readonly number[])[],
  perplexity: number,
): { P: number[][]; beta: number[] } {
  const n = D.length;
  const desired = Math.log(perplexity);
  const P: number[][] = [];
  const betas: number[] = [];
  for (let i = 0; i < n; i++) {
    // Distances are measured from the nearest neighbour. This cancels out of
    // p(j | i) and of the entropy, but keeps the nearest term at exp(0) = 1,
    // so a far-away point's row can never underflow to all zeros.
    const nearestDistance = Math.min(...D[i].filter((_, j) => j !== i));
    const d = D[i].map((v) => v - nearestDistance);
    let beta = 1;
    let lo = -Infinity;
    let hi = Infinity;
    let row: number[] = [];
    for (let step = 0; step < 100; step++) {
      row = d.map((v, j) => (j === i ? 0 : Math.exp(-v * beta)));
      const total = row.reduce((t, v) => t + v, 0);
      row = row.map((v) => v / total);
      const entropy =
        Math.log(total) + beta * row.reduce((t, v, j) => t + d[j] * v, 0);
      const diff = entropy - desired;
      if (Math.abs(diff) <= 1e-5) break;
      if (diff > 0) {
        lo = beta;
        beta = hi === Infinity ? beta * 2 : (beta + hi) / 2;
      } else {
        hi = beta;
        beta = lo === -Infinity ? beta / 2 : (beta + lo) / 2;
      }
    }
    P.push(row);
    betas.push(beta);
  }
  return { P, beta: betas };
}

/** The pairs (i, j) with i < j, in the order of a condensed matrix. */
export function pairs(n: number): [number, number][] {
  const list: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) list.push([i, j]);
  }
  return list;
}

/**
 * Joint probabilities p_ij = (p(j | i) + p(i | j)) / 2n, one per pair, in
 * condensed order. Symmetric, and they add up to 1 over all pairs i ≠ j.
 */
export function jointP(
  D: readonly (readonly number[])[],
  perplexity: number,
): number[] {
  const { P } = conditionalP(D, perplexity);
  const list = pairs(D.length).map(([i, j]) => P[i][j] + P[j][i]);
  const total = Math.max(
    list.reduce((t, v) => t + 2 * v, 0),
    EPSILON,
  );
  return list.map((v) => Math.max(v / total, EPSILON));
}

/**
 * The cost t-SNE makes smaller, KL(P ‖ Q) = Σ p log(p / q), where q_ij comes
 * from a Student-t curve on the map, and its gradient for every coordinate.
 * The pair sums count each pair twice (i, j and j, i), as scikit-learn does.
 */
export function klDivergence(
  Y: Map2D,
  P: readonly number[],
): { cost: number; grad: Map2D; Q: number[] } {
  const n = Y.length;
  const list = pairs(n);
  const w = list.map(([i, j]) => {
    const dx = Y[i][0] - Y[j][0];
    const dy = Y[i][1] - Y[j][1];
    return 1 / (1 + dx * dx + dy * dy);
  });
  const total = 2 * w.reduce((t, v) => t + v, 0);
  const Q = w.map((v) => Math.max(v / total, EPSILON));
  const cost =
    2 * P.reduce((t, p, k) => t + p * Math.log(Math.max(p, EPSILON) / Q[k]), 0);
  const grad: Map2D = Y.map(() => [0, 0]);
  list.forEach(([i, j], k) => {
    const pull = 4 * (P[k] - Q[k]) * w[k];
    const dx = Y[i][0] - Y[j][0];
    const dy = Y[i][1] - Y[j][1];
    grad[i][0] += pull * dx;
    grad[i][1] += pull * dy;
    grad[j][0] -= pull * dx;
    grad[j][1] -= pull * dy;
  });
  return { cost, grad, Q };
}

export interface Schedule {
  exaggeration: number;
  exaggeratedSteps: number;
  learningRate: number;
  /** Momentum before and after the exaggerated steps. */
  momentum: [number, number];
}

export interface Run {
  /** Steps taken so far. */
  step: number;
  Y: Map2D;
  /** The optimiser's memory: the last move and each coordinate's gain. */
  update: Map2D;
  gains: Map2D;
}

export function startRun(start: Map2D): Run {
  return {
    step: 0,
    Y: start.map(([x, y]) => [x, y]),
    update: start.map(() => [0, 0]),
    gains: start.map(() => [1, 1]),
  };
}

/**
 * One optimiser step, as scikit-learn's _gradient_descent: gains grow where
 * the gradient keeps its direction and shrink where it flips; the move keeps
 * some momentum. For the first steps P is exaggerated, so groups form early;
 * the optimiser's memory is reset when that ends.
 */
export function step(run: Run, P: readonly number[], schedule: Schedule): Run {
  const early = run.step < schedule.exaggeratedSteps;
  const fresh = run.step === schedule.exaggeratedSteps;
  const target = early ? P.map((p) => p * schedule.exaggeration) : P;
  const momentum = early ? schedule.momentum[0] : schedule.momentum[1];
  const update = fresh
    ? run.update.map(() => [0, 0] as [number, number])
    : run.update;
  const gains = fresh
    ? run.gains.map(() => [1, 1] as [number, number])
    : run.gains;
  const { grad } = klDivergence(run.Y, target);
  const next: Run = {
    step: run.step + 1,
    Y: [],
    update: [],
    gains: [],
  };
  run.Y.forEach((point, i) => {
    const y: [number, number] = [0, 0];
    const u: [number, number] = [0, 0];
    const g: [number, number] = [0, 0];
    for (const k of [0, 1] as const) {
      const sameWay = update[i][k] * grad[i][k] < 0;
      g[k] = Math.max(0.01, sameWay ? gains[i][k] + 0.2 : gains[i][k] * 0.8);
      u[k] =
        momentum * update[i][k] - schedule.learningRate * grad[i][k] * g[k];
      y[k] = point[k] + u[k];
    }
    next.Y.push(y);
    next.update.push(u);
    next.gains.push(g);
  });
  return next;
}

/** Runs from `run` until `steps` steps have been taken in all. */
export function advance(
  run: Run,
  P: readonly number[],
  schedule: Schedule,
  steps: number,
): Run {
  let at = run;
  while (at.step < steps) at = step(at, P, schedule);
  return at;
}

/** The k nearest other points of each point, nearest first (ties by index). */
export function nearest(
  D: readonly (readonly number[])[],
  k: number,
): number[][] {
  return D.map((row, i) =>
    row
      .map((d, j) => ({ d, j }))
      .filter(({ j }) => j !== i)
      .sort((a, b) => a.d - b.d || a.j - b.j)
      .slice(0, k)
      .map(({ j }) => j),
  );
}

/** Squared distances between the points of a map. */
export function mapDistances(Y: Map2D): number[][] {
  return squaredDistances(Y);
}

/** For each point: how many of its k nearest in the data are also among its k nearest on the map. */
export function kept(
  dataNearest: readonly (readonly number[])[],
  mapNearest: readonly (readonly number[])[],
): number[] {
  return dataNearest.map(
    (list, i) => list.filter((j) => mapNearest[i].includes(j)).length,
  );
}
