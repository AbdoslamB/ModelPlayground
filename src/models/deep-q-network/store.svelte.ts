import type { Dataset } from './data';
import type { Sample, Training, World } from './math';

import { clamp, snap } from '../../lib/format';
import {
  advance,
  greedyPath,
  qTable,
  shortestPath,
  startTraining,
} from './math';

export type Selection =
  | { kind: 'item'; id: number; source: 'graph' | 'table' }
  | { kind: 'symbol'; id: 'epsilon' | 'L' | 'n' };

/** A move drawn from the replay buffer for the last update. Its id is its place, from 1. */
export interface Draw extends Sample {
  id: number;
}

/** Training is saved every so many steps, so moving back and forth is quick. */
const CHECKPOINT = 250;

/**
 * The DQN Lab's state. Input writes the field, ε, how many training steps
 * have run, whether it is playing, and the selection. The network is the
 * training run up to that step; runs are saved every 250 steps (and the
 * latest one), so playing and scrubbing stay quick.
 */
export class DqnLab {
  readonly dataset: Dataset;

  worldIndex = $state(0);
  epsilon = $state(0.2);
  steps = $state(0);
  playing = $state(false);
  selection = $state<Selection | null>(null);

  // Not reactive: saved training runs for the current field and ε.
  #key = '';
  #saved: Training[] = [];

  constructor(dataset: Dataset) {
    this.dataset = dataset;
    this.epsilon = dataset.epsilon.initial;
    this.steps = dataset.steps.initial;
  }

  readonly world: World = $derived.by(
    () => this.dataset.worlds[this.worldIndex] ?? this.dataset.worlds[0],
  );
  readonly training: Training = $derived.by(() =>
    this.trainTo(this.worldIndex, this.epsilon, this.steps),
  );
  readonly Q = $derived(qTable(this.training.net, this.world));
  readonly path = $derived.by(() =>
    greedyPath(this.world, this.dataset.rewards, this.Q),
  );
  readonly shortest = $derived.by(() =>
    shortestPath(this.world, this.dataset.rewards),
  );
  readonly draws: Draw[] = $derived(
    this.training.batch.map((s, i) => ({ ...s, id: i + 1 })),
  );
  readonly done = $derived.by(() => this.steps >= this.dataset.steps.max);

  readonly selectedDraw = $derived(
    this.selection?.kind === 'item'
      ? this.draws.find((d) => d.id === (this.selection?.id ?? -1))
      : undefined,
  );
  readonly highlight = $derived(
    this.selection?.kind === 'symbol' ? this.selection.id : null,
  );

  /** The run at `steps`, carried on from the nearest saved run before it. */
  trainTo(worldIndex: number, epsilon: number, steps: number): Training {
    const world = this.dataset.worlds[worldIndex] ?? this.world;
    const { rewards, settings } = this.dataset;
    const key = `${worldIndex}|${epsilon}`;
    if (key !== this.#key) {
      this.#key = key;
      this.#saved = [startTraining(world, settings)];
    }
    let from = this.#saved[0] ?? startTraining(world, settings);
    for (const run of this.#saved) {
      if (run.steps <= steps && run.steps >= from.steps) from = run;
    }
    let run = from;
    while (run.steps < steps) {
      const next = Math.min(
        steps,
        (Math.floor(run.steps / CHECKPOINT) + 1) * CHECKPOINT,
      );
      run = advance(run, world, rewards, settings, epsilon, next);
      if (next % CHECKPOINT === 0) this.#saved.push(run);
    }
    // Keep the latest run too, so playing carries on from it.
    this.#saved = this.#saved.filter(
      (r) => r.steps % CHECKPOINT === 0 || r === run,
    );
    if (!this.#saved.includes(run)) this.#saved.push(run);
    return run;
  }

  /** "A1" for the top-left square: letters across, numbers down. */
  name(cell: number): string {
    const column = cell % this.world.columns;
    const row = Math.floor(cell / this.world.columns);
    return `${String.fromCharCode(65 + column)}${row + 1}`;
  }

  kind(cell: number): 'cat' | 'goal' | 'open' | 'start' {
    if (cell === this.world.start) return 'start';
    if (cell === this.world.goal) return 'goal';
    if (this.world.cats.includes(cell)) return 'cat';
    return 'open';
  }

  setSteps(value: number): void {
    const { min, max } = this.dataset.steps;
    this.steps = Math.round(clamp(value, min, max));
  }

  setEpsilon(value: number): void {
    const { min, max, step } = this.dataset.epsilon;
    this.epsilon = snap(clamp(value, min, max), step);
  }

  /** Moves training on; at the end it stops. */
  advanceBy(count: number): void {
    this.setSteps(this.steps + count);
    if (this.done) this.playing = false;
  }

  play(): void {
    if (this.done) this.steps = 0;
    this.playing = true;
  }

  reset(): void {
    this.playing = false;
    this.epsilon = this.dataset.epsilon.initial;
    this.steps = this.dataset.steps.initial;
  }

  nextWorld(): void {
    this.worldIndex = (this.worldIndex + 1) % this.dataset.worlds.length;
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
