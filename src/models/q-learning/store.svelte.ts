import type { Dataset } from './data';
import type { Params, World } from './math';

import { clamp, snap } from '../../lib/format';
import { greedyPath, shortestPath, train } from './math';

export type Selection =
  | { kind: 'item'; id: number; source: 'graph' | 'table' }
  | { kind: 'symbol'; id: 'alpha' | 'epsilon' | 'gamma' | 'n' };

/** A square the mouse can stand on and choose a move from. Its id is cell + 1. */
export interface Square {
  id: number;
  cell: number;
}

export type CellKind = 'cat' | 'goal' | 'open' | 'start' | 'wall';

/**
 * The Q-Learning Lab's state. Input writes the maze, how many training steps
 * have run, α, γ, ε, whether it is playing, and the selection. Training is
 * replayed from scratch with the same random seed whenever any of them
 * change, so every view always shows the same run.
 */
export class QLab {
  readonly dataset: Dataset;

  mazeIndex = $state(0);
  world = $state<World>({
    columns: 1,
    rows: 1,
    start: 0,
    goal: 0,
    walls: [],
    cats: [],
  });
  steps = $state(0);
  alpha = $state(0.5);
  gamma = $state(0.9);
  epsilon = $state(0.1);
  playing = $state(false);
  selection = $state<Selection | null>(null);

  constructor(dataset: Dataset) {
    this.dataset = dataset;
    this.alpha = dataset.alpha.initial;
    this.gamma = dataset.gamma.initial;
    this.epsilon = dataset.epsilon.initial;
    this.world = this.maze(0);
    this.steps = this.stepsFor(dataset.episodes.initial);
  }

  readonly params: Params = $derived({
    alpha: this.alpha,
    gamma: this.gamma,
    epsilon: this.epsilon,
  });
  readonly training = $derived.by(() =>
    train(
      this.world,
      this.dataset.rewards,
      this.params,
      this.dataset.seed,
      this.dataset.maxEpisodeSteps,
      { steps: this.steps },
    ),
  );
  readonly Q = $derived(this.training.Q);
  readonly last = $derived(this.training.last);
  readonly path = $derived.by(() =>
    greedyPath(this.world, this.dataset.rewards, this.Q),
  );
  readonly shortest = $derived.by(() =>
    shortestPath(this.world, this.dataset.rewards),
  );
  /** Squares the mouse can choose a move from: not walls, not the ends. */
  readonly squares: Square[] = $derived.by(() =>
    Array.from({ length: this.world.columns * this.world.rows }, (_, cell) => ({
      id: cell + 1,
      cell,
    })).filter(
      (s) => this.kind(s.cell) === 'open' || this.kind(s.cell) === 'start',
    ),
  );
  readonly done = $derived.by(
    () => this.training.episode >= this.dataset.episodes.max,
  );

  readonly selectedSquare = $derived(
    this.selection?.kind === 'item'
      ? this.squares.find((s) => s.id === (this.selection?.id ?? -1))
      : undefined,
  );
  readonly highlight = $derived(
    this.selection?.kind === 'symbol' ? this.selection.id : null,
  );

  maze(index: number): World {
    const world = this.dataset.mazes[index] ?? this.dataset.mazes[0];
    return world
      ? { ...world, walls: [...world.walls], cats: [...world.cats] }
      : this.world;
  }

  /** How many steps it takes to finish `episodes` episodes, with today's settings. */
  stepsFor(episodes: number): number {
    return train(
      this.world,
      this.dataset.rewards,
      {
        alpha: this.alpha,
        gamma: this.gamma,
        epsilon: this.epsilon,
      },
      this.dataset.seed,
      this.dataset.maxEpisodeSteps,
      { episodes },
    ).steps;
  }

  kind(cell: number): CellKind {
    if (cell === this.world.start) return 'start';
    if (cell === this.world.goal) return 'goal';
    if (this.world.walls.includes(cell)) return 'wall';
    if (this.world.cats.includes(cell)) return 'cat';
    return 'open';
  }

  /** "A1" for the top-left square: letters across, numbers down. */
  name(cell: number): string {
    const column = cell % this.world.columns;
    const row = Math.floor(cell / this.world.columns);
    return `${String.fromCharCode(65 + column)}${row + 1}`;
  }

  setEpisodes(value: number): void {
    const { min, max } = this.dataset.episodes;
    this.steps = this.stepsFor(Math.round(clamp(value, min, max)));
  }

  setParam(name: 'alpha' | 'epsilon' | 'gamma', value: number): void {
    const { min, max, step } = this.dataset[name];
    this[name] = snap(clamp(value, min, max), step);
  }

  /** One more move of the mouse, and one more update. */
  step(): void {
    if (this.done) {
      this.playing = false;
      return;
    }
    this.steps += 1;
  }

  /** Open square → wall → cat → open. The start and the cheese stay put. */
  cycle(cell: number): void {
    const kind = this.kind(cell);
    if (kind === 'start' || kind === 'goal') return;
    const walls = this.world.walls.filter((c) => c !== cell);
    const cats = this.world.cats.filter((c) => c !== cell);
    if (kind === 'open') walls.push(cell);
    if (kind === 'wall') cats.push(cell);
    this.world = { ...this.world, walls, cats };
  }

  reset(): void {
    this.playing = false;
    this.alpha = this.dataset.alpha.initial;
    this.gamma = this.dataset.gamma.initial;
    this.epsilon = this.dataset.epsilon.initial;
    this.world = this.maze(this.mazeIndex);
    this.steps = this.stepsFor(this.dataset.episodes.initial);
  }

  nextMaze(): void {
    this.mazeIndex = (this.mazeIndex + 1) % this.dataset.mazes.length;
    this.selection = null;
    this.reset();
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
