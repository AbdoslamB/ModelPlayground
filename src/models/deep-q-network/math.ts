/**
 * Deep Q-Network math. Pure functions: no DOM, no state. Every number the
 * learner sees comes from here. A small network (2 inputs, ReLU hidden
 * units, 4 outputs) estimates the Q-values, trained with replay and a target
 * network. Every sum is done in the same order as python/deep_q_network.py,
 * and the randomness is the same mulberry32, so math.test.ts can check the
 * weights step for step; it also checks the backpropagation numerically.
 */
import { resumable } from '../../lib/rng';

export interface World {
  columns: number;
  rows: number;
  /** Cells are numbered row by row from the top left, starting at 0. */
  start: number;
  goal: number;
  cats: number[];
}

export interface Rewards {
  step: number;
  goal: number;
  cat: number;
}

export interface Settings {
  hidden: number;
  learningRate: number;
  batch: number;
  /** How many recent moves the replay buffer keeps. */
  capacity: number;
  /** The target network is copied from the network every so many steps. */
  targetEvery: number;
  gamma: number;
  maxEpisodeSteps: number;
  seed: number;
}

export interface Net {
  W1: number[][];
  b1: number[];
  W2: number[][];
  b2: number[];
}

/** Up, right, down, left. */
export const ACTIONS = ['up', 'right', 'down', 'left'] as const;
const MOVES: readonly [number, number][] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];

/** One move: the next square, its reward, and whether the episode ends. */
export function move(
  world: World,
  rewards: Rewards,
  cell: number,
  action: number,
): { next: number; reward: number; done: boolean } {
  const r = Math.floor(cell / world.columns) + MOVES[action][0];
  const c = (cell % world.columns) + MOVES[action][1];
  const inside = r >= 0 && r < world.rows && c >= 0 && c < world.columns;
  const next = inside ? r * world.columns + c : cell;
  if (next === world.goal) return { next, reward: rewards.goal, done: true };
  if (world.cats.includes(next))
    return { next, reward: rewards.cat, done: true };
  return { next, reward: rewards.step, done: false };
}

/** What the network sees of a square: its column and row, from 0 to 1. */
export function features(world: World, cell: number): [number, number] {
  return [
    (cell % world.columns) / (world.columns - 1),
    Math.floor(cell / world.columns) / (world.rows - 1),
  ];
}

/** h = ReLU(W1 x + b1), q = W2 h + b2: one Q-value per move. */
export function forward(
  net: Net,
  x: readonly number[],
): { hidden: number[]; q: number[] } {
  const hidden = net.b1.map((bias, j) => {
    let v = bias;
    for (let k = 0; k < x.length; k++) v += net.W1[j][k] * x[k];
    return v > 0 ? v : 0;
  });
  const q = net.b2.map((bias, a) => {
    let v = bias;
    for (let j = 0; j < hidden.length; j++) v += net.W2[a][j] * hidden[j];
    return v;
  });
  return { hidden, q };
}

/** The best move: the first of the highest values. */
export function argmax(q: readonly number[]): number {
  let top = 0;
  for (let a = 1; a < q.length; a++) if (q[a] > q[top]) top = a;
  return top;
}

export function copyNet(net: Net): Net {
  return {
    W1: net.W1.map((row) => [...row]),
    b1: [...net.b1],
    W2: net.W2.map((row) => [...row]),
    b2: [...net.b2],
  };
}

/** Small random weights, zero biases. */
export function initNet(hidden: number, random: () => number): Net {
  const W1 = Array.from({ length: hidden }, () =>
    [0, 0].map(() => (random() * 2 - 1) * Math.sqrt(1 / 2)),
  );
  const W2 = Array.from({ length: 4 }, () =>
    Array.from(
      { length: hidden },
      () => (random() * 2 - 1) * Math.sqrt(1 / hidden),
    ),
  );
  return { W1, b1: W1.map(() => 0), W2, b2: [0, 0, 0, 0] };
}

export interface Transition {
  cell: number;
  action: number;
  reward: number;
  next: number;
  done: boolean;
}

export interface Sample extends Transition {
  /** max Q_target(s′, a′): the best value of the next square; 0 at the end. */
  future: number;
  /** y = r + γ · future: what Q(s, a) should be. */
  target: number;
  /** Q(s, a) from the network, before this step's update. */
  prediction: number;
  /** y − Q(s, a). */
  error: number;
  /** (y − Q(s, a))². */
  loss: number;
}

/**
 * The squared-error loss of a minibatch, (Q(s, a) − y)² on average, and its
 * gradient for every weight (by backpropagation).
 */
export function lossAndGradient(
  net: Net,
  world: World,
  samples: readonly Sample[],
): { loss: number; grad: Net } {
  const H = net.b1.length;
  const grad: Net = {
    W1: Array.from({ length: H }, () => [0, 0]),
    b1: new Array<number>(H).fill(0),
    W2: Array.from({ length: 4 }, () => new Array<number>(H).fill(0)),
    b2: [0, 0, 0, 0],
  };
  let loss = 0;
  for (const s of samples) {
    const x = features(world, s.cell);
    const { hidden, q } = forward(net, x);
    const error = q[s.action] - s.target;
    loss += (error * error) / samples.length;
    const e = (2 * error) / samples.length;
    for (let j = 0; j < H; j++) grad.W2[s.action][j] += e * hidden[j];
    grad.b2[s.action] += e;
    for (let j = 0; j < H; j++) {
      const dh = hidden[j] > 0 ? e * net.W2[s.action][j] : 0;
      for (let k = 0; k < 2; k++) grad.W1[j][k] += dh * x[k];
      grad.b1[j] += dh;
    }
  }
  return { loss, grad };
}

export interface Training {
  net: Net;
  /** The copy used for targets; refreshed every `targetEvery` steps. */
  target: Net;
  buffer: Transition[];
  steps: number;
  /** Total reward of every finished episode, in order. */
  episodes: number[];
  position: number;
  inEpisode: number;
  /** Reward so far in the current episode. */
  total: number;
  /** The minibatch learned from in the last step, if any. */
  batch: Sample[];
  /** The batch's loss, before the update. */
  loss: number | null;
  /** The random generator's inner state, so training can carry on later. */
  random: number;
}

/** Fresh weights, an empty buffer, the mouse at the start. */
export function startTraining(world: World, settings: Settings): Training {
  const rng = resumable(settings.seed);
  const net = initNet(settings.hidden, rng.random);
  return {
    net,
    target: copyNet(net),
    buffer: [],
    steps: 0,
    episodes: [],
    position: world.start,
    inEpisode: 0,
    total: 0,
    batch: [],
    loss: null,
    random: rng.state(),
  };
}

/**
 * Carries training on until `steps` steps in all, without changing `from`.
 * Each step: move ε-greedily, remember the move, and (once the buffer holds
 * a batch) draw a minibatch, work out each target with the target network,
 * and take one gradient step.
 */
export function advance(
  from: Training,
  world: World,
  rewards: Rewards,
  settings: Settings,
  epsilon: number,
  steps: number,
): Training {
  const rng = resumable(from.random);
  const random = rng.random;
  const net = copyNet(from.net);
  let target = copyNet(from.target);
  const buffer = [...from.buffer];
  const episodes = [...from.episodes];
  let { position, inEpisode, total, batch, loss } = from;
  for (let t = from.steps + 1; t <= steps; t++) {
    const { q } = forward(net, features(world, position));
    const action = random() < epsilon ? Math.floor(random() * 4) : argmax(q);
    const out = move(world, rewards, position, action);
    buffer.push({ cell: position, action, ...out });
    if (buffer.length > settings.capacity) buffer.shift();
    if (buffer.length >= settings.batch) {
      batch = [];
      for (let i = 0; i < settings.batch; i++) {
        const tr = buffer[Math.floor(random() * buffer.length)];
        const future = tr.done
          ? 0
          : Math.max(...forward(target, features(world, tr.next)).q);
        const y = tr.done ? tr.reward : tr.reward + settings.gamma * future;
        const prediction = forward(net, features(world, tr.cell)).q[tr.action];
        batch.push({
          ...tr,
          future,
          target: y,
          prediction,
          error: y - prediction,
          loss: (y - prediction) ** 2,
        });
      }
      const result = lossAndGradient(net, world, batch);
      loss = result.loss;
      const lr = settings.learningRate;
      net.W1.forEach((row, j) => {
        row.forEach((_, k) => {
          row[k] -= lr * result.grad.W1[j][k];
        });
        net.b1[j] -= lr * result.grad.b1[j];
      });
      net.W2.forEach((row, a) => {
        row.forEach((_, j) => {
          row[j] -= lr * result.grad.W2[a][j];
        });
        net.b2[a] -= lr * result.grad.b2[a];
      });
    }
    if (t % settings.targetEvery === 0) target = copyNet(net);
    total += out.reward;
    position = out.next;
    inEpisode += 1;
    if (out.done || inEpisode >= settings.maxEpisodeSteps) {
      episodes.push(total);
      position = world.start;
      inEpisode = 0;
      total = 0;
    }
  }
  return {
    net,
    target,
    buffer,
    steps: Math.max(from.steps, steps),
    episodes,
    position,
    inEpisode,
    total,
    batch,
    loss,
    random: rng.state(),
  };
}

/** Trains from fresh weights for `steps` steps. */
export function train(
  world: World,
  rewards: Rewards,
  settings: Settings,
  epsilon: number,
  steps: number,
): Training {
  return advance(
    startTraining(world, settings),
    world,
    rewards,
    settings,
    epsilon,
    steps,
  );
}

/** Every square's four Q-values, from the network. */
export function qTable(net: Net, world: World): number[][] {
  return Array.from(
    { length: world.columns * world.rows },
    (_, cell) => forward(net, features(world, cell)).q,
  );
}

/** The path from the start if the mouse always takes its best move. */
export function greedyPath(
  world: World,
  rewards: Rewards,
  Q: readonly (readonly number[])[],
  limit = 30,
): { cells: number[]; reached: boolean } {
  const cells = [world.start];
  let cell = world.start;
  for (let i = 0; i < limit; i++) {
    const out = move(world, rewards, cell, argmax(Q[cell]));
    cell = out.next;
    cells.push(cell);
    if (out.done) return { cells, reached: cell === world.goal };
  }
  return { cells, reached: false };
}

/** The fewest moves from the start to the cheese without meeting a cat. */
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
