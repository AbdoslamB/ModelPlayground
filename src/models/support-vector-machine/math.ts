/**
 * Support Vector Machine math. Pure functions: no DOM, no state. Every number
 * the learner sees comes from here. The solver follows libsvm (the library
 * behind scikit-learn's SVC): the same choice of working pair, the same
 * update and the same intercept, and math.test.ts checks the results against
 * scikit-learn's.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Row extends Point {
  id: number;
  label: string;
}

export type Kernel = { type: 'linear' } | { type: 'rbf'; gamma: number };

/** K(a, b): a · b for a straight border, e^(−γ‖a − b‖²) for a curved one. */
export function kernel(k: Kernel, a: Point, b: Point): number {
  if (k.type === 'linear') return a.x * b.x + a.y * b.y;
  return Math.exp(-k.gamma * ((a.x - b.x) ** 2 + (a.y - b.y) ** 2));
}

export interface Machine {
  kernel: Kernel;
  points: Point[];
  /** +1 or −1 for each point. */
  signs: number[];
  /** The weight of each point in the border; 0 for all but the support vectors. */
  alpha: number[];
  /** The intercept: f(x) = Σ αᵢ yᵢ K(xᵢ, x) + b. */
  b: number;
}

const TAU = 1e-12;

/**
 * Trains a soft-margin SVM by solving its dual problem, two weights at a
 * time (sequential minimal optimisation, as libsvm does it):
 * minimise ½ ΣΣ αᵢαⱼyᵢyⱼK(xᵢ, xⱼ) − Σ αᵢ, with 0 ≤ αᵢ ≤ C and Σ αᵢyᵢ = 0.
 */
export function train(
  points: readonly Point[],
  signs: readonly number[],
  C: number,
  k: Kernel,
  tolerance = 1e-9,
  maxSteps = 100_000,
): Machine {
  const n = points.length;
  const y = signs.map((s) => (s > 0 ? 1 : -1));
  const K = points.map((a) => points.map((b) => kernel(k, a, b)));
  const alpha = new Array<number>(n).fill(0);
  // The gradient of the objective: Qα − 1, with Qᵢⱼ = yᵢyⱼK(xᵢ, xⱼ). At α = 0
  // it is −1 everywhere.
  const G = new Array<number>(n).fill(-1);
  const upper = (t: number) => alpha[t] >= C;
  const lower = (t: number) => alpha[t] <= 0;
  // The curvature along the pair (i, j); never zero, so steps stay finite.
  const curve = (i: number, j: number) => {
    const a = K[i][i] + K[j][j] - 2 * K[i][j];
    return a > 0 ? a : TAU;
  };

  for (let step = 0; step < maxSteps; step++) {
    // Pick i: the weight that most wants to move.
    let gmax = -Infinity;
    let i = -1;
    for (let t = 0; t < n; t++) {
      const free = y[t] > 0 ? !upper(t) : !lower(t);
      if (free && -y[t] * G[t] >= gmax) {
        gmax = -y[t] * G[t];
        i = t;
      }
    }
    // Pick j: the partner that lowers the objective most together with i.
    let gmax2 = -Infinity;
    let j = -1;
    let best = Infinity;
    for (let t = 0; t < n; t++) {
      const free = y[t] > 0 ? !lower(t) : !upper(t);
      if (!free) continue;
      const v = y[t] * G[t];
      if (v >= gmax2) gmax2 = v;
      const diff = gmax + v;
      if (i !== -1 && diff > 0) {
        const gain = -(diff * diff) / curve(i, t);
        if (gain <= best) {
          best = gain;
          j = t;
        }
      }
    }
    // Stop when no pair can lower the objective by more than the tolerance.
    if (gmax + gmax2 < tolerance || j === -1) break;

    // Move αᵢ and αⱼ together, keeping Σ αᵢyᵢ = 0, then clip to [0, C].
    const ai = alpha[i];
    const aj = alpha[j];
    let ni: number;
    let nj: number;
    if (y[i] !== y[j]) {
      const delta = (-G[i] - G[j]) / curve(i, j);
      const diff = ai - aj;
      ni = ai + delta;
      nj = aj + delta;
      if (diff > 0) {
        if (nj < 0) [nj, ni] = [0, diff];
      } else if (ni < 0) [ni, nj] = [0, -diff];
      if (diff > 0) {
        if (ni > C) [ni, nj] = [C, C - diff];
      } else if (nj > C) [nj, ni] = [C, C + diff];
    } else {
      const delta = (G[i] - G[j]) / curve(i, j);
      const sum = ai + aj;
      ni = ai - delta;
      nj = aj + delta;
      if (sum > C) {
        if (ni > C) [ni, nj] = [C, sum - C];
      } else if (nj < 0) [nj, ni] = [0, sum];
      if (sum > C) {
        if (nj > C) [nj, ni] = [C, sum - C];
      } else if (ni < 0) [ni, nj] = [0, sum];
    }
    alpha[i] = ni;
    alpha[j] = nj;
    for (let t = 0; t < n; t++) {
      G[t] += y[t] * (y[i] * K[i][t] * (ni - ai) + y[j] * K[j][t] * (nj - aj));
    }
  }

  // The intercept: the average over points strictly inside the bounds, or
  // the middle of the allowed range if there are none.
  let free = 0;
  let sum = 0;
  let ub = Infinity;
  let lb = -Infinity;
  for (let t = 0; t < n; t++) {
    const yg = y[t] * G[t];
    const toUpper = y[t] > 0 ? lower(t) : upper(t);
    const toLower = y[t] > 0 ? upper(t) : lower(t);
    if (toUpper) ub = Math.min(ub, yg);
    else if (toLower) lb = Math.max(lb, yg);
    else {
      free += 1;
      sum += yg;
    }
  }
  // With one class only, one bound stays infinite: use the other one.
  const rho =
    free > 0
      ? sum / free
      : Number.isFinite(ub) && Number.isFinite(lb)
        ? (ub + lb) / 2
        : Number.isFinite(ub)
          ? ub
          : Number.isFinite(lb)
            ? lb
            : 0;
  return { kernel: k, points: [...points], signs: y, alpha, b: -rho };
}

/** f(x) = Σ αᵢ yᵢ K(xᵢ, x) + b. Above 0: the positive side. */
export function decide(machine: Machine, point: Point): number {
  return machine.points.reduce(
    (total, p, i) =>
      total +
      machine.alpha[i] * machine.signs[i] * kernel(machine.kernel, p, point),
    machine.b,
  );
}

/** The support vectors: the points with a weight above `epsilon`. */
export function supportVectors(machine: Machine, epsilon = 1e-8): number[] {
  return machine.alpha.flatMap((a, i) => (a > epsilon ? [i] : []));
}

/** For a straight border: w = Σ αᵢ yᵢ xᵢ, so f(x) = w · x + b. */
export function weights(machine: Machine): Point {
  return machine.points.reduce(
    (w, p, i) => {
      const c = machine.alpha[i] * machine.signs[i];
      return { x: w.x + c * p.x, y: w.y + c * p.y };
    },
    { x: 0, y: 0 },
  );
}

/** The width of the street between the two margin lines: 2 ÷ ‖w‖. */
export function marginWidth(w: Point): number {
  const norm = Math.hypot(w.x, w.y);
  return norm > 0 ? 2 / norm : Infinity;
}

/** Slack ξ = max(0, 1 − y f(x)): how far a point is on the wrong side of its margin line. */
export function slack(sign: number, value: number): number {
  return Math.max(0, 1 - sign * value);
}

/** The soft-margin objective for a straight border: ½‖w‖² + C Σ ξᵢ. */
export function objective(
  machine: Machine,
  C: number,
): {
  size: number;
  slack: number;
  total: number;
} {
  const w = weights(machine);
  const size = 0.5 * (w.x ** 2 + w.y ** 2);
  const total = machine.points.reduce(
    (t, p, i) => t + slack(machine.signs[i], decide(machine, p)),
    0,
  );
  return { size, slack: total, total: size + C * total };
}

/**
 * For a straight border: the nearest spot where f equals `level`, starting
 * from a point. Used to draw a point's slack as a line to its margin line.
 */
export function stepTo(machine: Machine, point: Point, level: number): Point {
  const w = weights(machine);
  const norm2 = w.x ** 2 + w.y ** 2;
  if (norm2 === 0) return { ...point };
  const move = (level - decide(machine, point)) / norm2;
  return { x: point.x + move * w.x, y: point.y + move * w.y };
}

export interface Grid {
  x: readonly [number, number];
  y: readonly [number, number];
  columns: number;
  lines: number;
}

/** f at every corner of a grid: lines + 1 rows of columns + 1, from the bottom. */
export function sampleGrid(machine: Machine, grid: Grid): number[][] {
  const [x0, x1] = grid.x;
  const [y0, y1] = grid.y;
  return Array.from({ length: grid.lines + 1 }, (_, j) =>
    Array.from({ length: grid.columns + 1 }, (_, i) =>
      decide(machine, {
        x: x0 + ((x1 - x0) * i) / grid.columns,
        y: y0 + ((y1 - y0) * j) / grid.lines,
      }),
    ),
  );
}

/**
 * The line where the sampled values equal `level`, as short segments
 * (marching squares, with straight-line interpolation along cell edges).
 */
export function contour(
  values: readonly (readonly number[])[],
  grid: Grid,
  level: number,
): [Point, Point][] {
  const [x0, x1] = grid.x;
  const [y0, y1] = grid.y;
  const dx = (x1 - x0) / grid.columns;
  const dy = (y1 - y0) / grid.lines;
  const segments: [Point, Point][] = [];
  const at = (i: number, j: number) => (values[j]?.[i] ?? level) - level;
  // Where the level crosses the edge from corner a to corner b.
  const cross = (a: Point, b: Point, va: number, vb: number): Point => {
    const t = va / (va - vb);
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  };
  for (let j = 0; j < grid.lines; j++) {
    for (let i = 0; i < grid.columns; i++) {
      const corners = [
        { p: { x: x0 + i * dx, y: y0 + j * dy }, v: at(i, j) },
        { p: { x: x0 + (i + 1) * dx, y: y0 + j * dy }, v: at(i + 1, j) },
        {
          p: { x: x0 + (i + 1) * dx, y: y0 + (j + 1) * dy },
          v: at(i + 1, j + 1),
        },
        { p: { x: x0 + i * dx, y: y0 + (j + 1) * dy }, v: at(i, j + 1) },
      ];
      // The crossing points on the cell's four edges, in order.
      const crossings: Point[] = [];
      corners.forEach((a, e) => {
        const b = corners[(e + 1) % 4];
        if (a.v >= 0 !== b.v >= 0) crossings.push(cross(a.p, b.p, a.v, b.v));
      });
      const [c0, c1, c2, c3] = crossings;
      if (c0 && c1 && c2 && c3) {
        // A saddle: the centre decides which corners join.
        const centre = corners.reduce((t, c) => t + c.v, 0) / 4;
        const firstAbove = corners[0].v >= 0;
        if (centre >= 0 === firstAbove) {
          segments.push([c0, c1], [c2, c3]);
        } else {
          segments.push([c3, c0], [c1, c2]);
        }
      } else if (c0 && c1) {
        segments.push([c0, c1]);
      }
    }
  }
  return segments;
}
