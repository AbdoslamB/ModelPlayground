import type { Dataset, KindInfo, Picture } from './data';
import type { Map2D, Run } from './math';

import { clamp } from '../../lib/format';
import {
  advance,
  conditionalP,
  jointP,
  kept,
  klDivergence,
  mapDistances,
  nearest,
  squaredDistances,
  startRun,
} from './math';

export type Selection =
  | { kind: 'item'; id: number; source: 'graph' | 'table' }
  | { kind: 'symbol'; id: 'KL' | 'perplexity' | 't' };

/** Runs are kept every so many steps, so moving back and forth is quick. */
const CHECKPOINT = 50;

/**
 * The t-SNE Lab's state. Input writes the perplexity, how many optimiser
 * steps have run, the data set, whether it is playing, and the selection.
 * The map is the run from the stored start positions to that step; runs are
 * cached every 50 steps, so playing and scrubbing stay quick.
 */
export class TsneLab {
  readonly dataset: Dataset;

  batchIndex = $state(0);
  perplexity = $state(8);
  steps = $state(0);
  playing = $state(false);
  selection = $state<Selection | null>(null);

  // Not reactive: a cache of runs for the current P.
  #cacheP: readonly number[] | null = null;
  #checkpoints: Run[] = [];

  constructor(dataset: Dataset) {
    this.dataset = dataset;
    this.perplexity = dataset.perplexity.initial;
    this.steps = dataset.steps.initial;
  }

  readonly rows: Picture[] = $derived.by(
    () =>
      this.dataset.batches[this.batchIndex] ?? this.dataset.batches[0] ?? [],
  );
  readonly D = $derived(squaredDistances(this.rows.map((r) => r.pixels)));
  readonly P = $derived(jointP(this.D, this.perplexity));
  /** Each picture's σ: the width of its neighbourhood, in pixel units. */
  readonly sigma = $derived(
    conditionalP(this.D, this.perplexity).beta.map((b) =>
      Math.sqrt(1 / (2 * b)),
    ),
  );
  readonly run: Run = $derived.by(() => this.runTo(this.P, this.steps));
  readonly Y: Map2D = $derived(this.run.Y);
  readonly cost = $derived(klDivergence(this.Y, this.P).cost);
  readonly early = $derived.by(
    () => this.steps < this.dataset.schedule.exaggeratedSteps,
  );
  readonly dataNearest = $derived.by(() =>
    nearest(this.D, this.dataset.neighbours),
  );
  readonly mapNearest = $derived.by(() =>
    nearest(mapDistances(this.Y), this.dataset.neighbours),
  );
  readonly kept = $derived(kept(this.dataNearest, this.mapNearest));
  readonly keptShare = $derived.by(
    () =>
      this.kept.reduce((t, k) => t + k, 0) /
      Math.max(1, this.kept.length * this.dataset.neighbours),
  );
  readonly done = $derived.by(
    () => this.steps >= this.dataset.schedule.totalSteps,
  );

  readonly selectedRow = $derived(
    this.selection?.kind === 'item'
      ? this.rows.find((r) => r.id === (this.selection?.id ?? -1))
      : undefined,
  );
  /** The picture the distances are measured from: the selected one, or #1. */
  readonly reference = $derived(this.selectedRow ?? this.rows[0]);
  readonly highlight = $derived(
    this.selection?.kind === 'symbol' ? this.selection.id : null,
  );

  /** The run at `steps`, continued from the nearest cached run before it. */
  runTo(P: readonly number[], steps: number): Run {
    if (this.#cacheP !== P) {
      this.#cacheP = P;
      this.#checkpoints = [startRun(this.rows.map((r) => r.start))];
    }
    let from = this.#checkpoints[0] ?? startRun([]);
    for (const run of this.#checkpoints) if (run.step <= steps) from = run;
    let run = from;
    while (run.step < steps) {
      const next = Math.min(
        steps,
        (Math.floor(run.step / CHECKPOINT) + 1) * CHECKPOINT,
      );
      run = advance(run, P, this.dataset.schedule, next);
      if (
        next % CHECKPOINT === 0 &&
        !this.#checkpoints.some((c) => c.step === next)
      ) {
        this.#checkpoints.push(run);
      }
    }
    return run;
  }

  kindInfo(id: string): KindInfo | undefined {
    return this.dataset.kinds.find((k) => k.id === id);
  }

  /** Kind index for colors: 1 to 4. */
  kindIndex(id: string): number {
    return this.dataset.kinds.findIndex((k) => k.id === id) + 1;
  }

  /** The index of a picture in the rows (and in D, P and the map). */
  indexOf(id: number): number {
    return this.rows.findIndex((r) => r.id === id);
  }

  setPerplexity(value: number): void {
    const { min, max } = this.dataset.perplexity;
    this.perplexity = Math.round(clamp(value, min, max));
  }

  setSteps(value: number): void {
    const { min, max } = this.dataset.steps;
    this.steps = Math.round(clamp(value, min, max));
  }

  /** Moves the optimiser on; at the end it stops. */
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
    this.perplexity = this.dataset.perplexity.initial;
    this.steps = this.dataset.steps.initial;
  }

  nextBatch(): void {
    this.batchIndex = (this.batchIndex + 1) % this.dataset.batches.length;
    this.#cacheP = null;
    this.selection = null;
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
