/**
 * Q-Learning math. Pure functions: no DOM, no state. Every number the learner
 * sees comes from here. Exploration uses mulberry32, the same generator as
 * python/q_learning.py, so math.test.ts can check the Q-table step for step
 * against it, and against value iteration's exact answer.
 */
import { mulberry32 } from '../../lib/rng';

export interface World {
  columns: number;
  rows: number;
  /** Cells are numbered row by row from the top left, starting at 0. */
  start: number;
  goal: number;
  walls: number[];
  cats: number[];
}

export interface Rewards {
  step: number;
  goal: number;
  cat: number;
}

export interface Params {
  alpha: number;
  gamma: number;
  epsilon: number;
}

/** Up, right, down, left. */
export const ACTIONS = ['up', 'right', 'down', 'left'] as const;
const MOVES: readonly [number, number][] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

export interface Outcome {
  next: number;
  reward: number;
  /** The episode ends: the mouse found the cheese or the cat. */
  done: boolean;
}

/** One move. Walls and the edge block it: the mouse stays put. */
export function move(
  world: World,
  rewards: Rewards,
  cell: number,
  action: number,
): Outcome {
  const row = Math.floor(cell / world.columns);
  const col = cell % world.columns;
  const [dr, dc] = MOVES[action];
  const r = row + dr;
  const c = col + dc;
  const target = r * world.columns + c;
  const open =
    r >= 0 &&
    r < world.rows &&
    c >= 0 &&
    c < world.columns &&
    !world.walls.includes(target);
  const next = open ? target : cell;
  if (next === world.goal) return { next, reward: rewards.goal, done: true };
  if (world.cats.includes(next))
    return { next, reward: rewards.cat, done: true };
  return { next, reward: rewards.step, done: false };
}

/** The largest of a cell's four Q-values. */
export function best(q: readonly number[]): number {
  return Math.max(...q);
}

/**
 * ε-greedy: with chance ε a random move (exploring), else the best move
 * (ties broken at random).
 */
export function choose(
  q: readonly number[],
  epsilon: number,
  random: () => number,
): { action: number; explored: boolean } {
  if (random() < epsilon) {
    return { action: Math.floor(random() * 4), explored: true };
  }
  const top = best(q);
  const ties = [0, 1, 2, 3].filter((a) => q[a] === top);
  const action =
    ties.length === 1 ? ties[0] : ties[Math.floor(random() * ties.length)];
  return { action, explored: false };
}

export interface Update {
  cell: number;
  action: number;
  reward: number;
  next: number;
  done: boolean;
  /** Q(s, a) before the update. */
  before: number;
  /** maxₐ′ Q(s′, a′); 0 when the episode ends. */
  future: number;
  /** r + γ · future: what Q(s, a) moves towards. */
  target: number;
  after: number;
  /** The move was a random one (exploring), not the best known. */
  explored: boolean;
}

/**
 * One Q-learning update: Q(s, a) ← Q(s, a) + α [r + γ maxₐ′ Q(s′, a′) − Q(s, a)].
 * Changes `Q` in place and returns the numbers used.
 */
export function learn(
  Q: number[][],
  cell: number,
  action: number,
  outcome: Outcome,
  params: Params,
  explored = false,
): Update {
  const row = Q[cell];
  const before = row[action];
  const future = outcome.done ? 0 : best(Q[outcome.next]);
  const target = outcome.reward + params.gamma * future;
  const after = before + params.alpha * (target - before);
  row[action] = after;
  return {
    cell,
    action,
    reward: outcome.reward,
    next: outcome.next,
    done: outcome.done,
    before,
    future,
    target,
    after,
    explored,
  };
}

export interface Training {
  Q: number[][];
  /** Updates made so far. */
  steps: number;
  /** Episodes finished so far. */
  episode: number;
  /** Where the mouse is now. */
  position: number;
  /** The most recent update, if any. */
  last: Update | null;
}

/**
 * Trains from scratch until `steps` updates or `episodes` episodes, whichever
 * comes first. An episode ends at the cheese, at the cat, or after
 * `maxEpisodeSteps` moves; the mouse then starts again.
 */
export function train(
  world: World,
  rewards: Rewards,
  params: Params,
  seed: number,
  maxEpisodeSteps: number,
  limit: { steps?: number; episodes?: number },
): Training {
  const random = mulberry32(seed);
  const Q = Array.from({ length: world.columns * world.rows }, () => [
    0, 0, 0, 0,
  ]);
  let position = world.start;
  let steps = 0;
  let episode = 0;
  let inEpisode = 0;
  let last: Update | null = null;
  const maxSteps = limit.steps ?? Infinity;
  const maxEpisodes = limit.episodes ?? Infinity;
  while (steps < maxSteps && episode < maxEpisodes) {
    const { action, explored } = choose(Q[position], params.epsilon, random);
    const outcome = move(world, rewards, position, action);
    last = learn(Q, position, action, outcome, params, explored);
    steps += 1;
    inEpisode += 1;
    position = outcome.next;
    if (outcome.done || inEpisode >= maxEpisodeSteps) {
      episode += 1;
      inEpisode = 0;
      position = world.start;
    }
  }
  return { Q, steps, episode, position, last };
}

/** The exact Q-values (value iteration), for a world with no randomness. */
export function valueIteration(
  world: World,
  rewards: Rewards,
  gamma: number,
  tolerance = 1e-12,
): number[][] {
  const Q = Array.from({ length: world.columns * world.rows }, () => [
    0, 0, 0, 0,
  ]);
  for (let sweep = 0; sweep < 10_000; sweep++) {
    let change = 0;
    for (let cell = 0; cell < Q.length; cell++) {
      if (
        world.walls.includes(cell) ||
        world.cats.includes(cell) ||
        cell === world.goal
      ) {
        continue;
      }
      for (let a = 0; a < 4; a++) {
        const out = move(world, rewards, cell, a);
        const value = out.reward + (out.done ? 0 : gamma * best(Q[out.next]));
        change = Math.max(change, Math.abs(value - Q[cell][a]));
        Q[cell][a] = value;
      }
    }
    if (change < tolerance) break;
  }
  return Q;
}

/**
 * The path the mouse takes if it always picks its best move (the first on a
 * tie), from the start. `reached` says whether it ends at the cheese.
 */
export function greedyPath(
  world: World,
  rewards: Rewards,
  Q: readonly (readonly number[])[],
  limit = 40,
): { cells: number[]; reached: boolean } {
  const cells = [world.start];
  let cell = world.start;
  for (let i = 0; i < limit; i++) {
    const q = Q[cell];
    const out = move(world, rewards, cell, q.indexOf(best(q)));
    cell = out.next;
    cells.push(cell);
    if (out.done) return { cells, reached: cell === world.goal };
  }
  return { cells, reached: false };
}

/** The fewest moves from the start to the cheese without meeting a cat, or null. */
export function shortestPath(world: World, rewards: Rewards): number | null {
  const distance = new Map<number, number>([[world.start, 0]]);
  const queue = [world.start];
  // The loop also visits squares pushed while it runs.
  for (const cell of queue) {
    for (let a = 0; a < 4; a++) {
      const { next } = move(world, rewards, cell, a);
      if (distance.has(next) || world.cats.includes(next)) continue;
      const d = Number(distance.get(cell)) + 1;
      if (next === world.goal) return d;
      distance.set(next, d);
      queue.push(next);
    }
  }
  return null;
}
