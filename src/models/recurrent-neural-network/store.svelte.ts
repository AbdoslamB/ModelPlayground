import type { Dataset } from './data';
import type { Step } from './math';

import { clamp, snap } from '../../lib/format';
import { mulberry32 } from '../../lib/rng';
import { encode, run, sample, softmax, surprise } from './math';

export type Selection =
  | { kind: 'item'; id: number; source: 'graph' | 'table' }
  | { kind: 'symbol'; id: 'T' | 'h' };

/** One time step, with its chances for the next character. Its id is t (from 1). */
export interface TimeStep extends Step {
  id: number;
  probabilities: number[];
  /** The character that actually comes next, if any. */
  next: number | null;
}

/**
 * The RNN Lab's state. Input writes the text, the temperature, how many
 * characters "Write" has added, and the selection. The network reads the
 * text from an empty memory every time; everything else is derived.
 */
export class RnnLab {
  readonly dataset: Dataset;

  exampleIndex = $state(0);
  text = $state('');
  temperature = $state(1);
  writes = $state(0);
  selection = $state<Selection | null>(null);

  constructor(dataset: Dataset) {
    this.dataset = dataset;
    this.temperature = dataset.temperature.initial;
    this.text = dataset.examples[0] ?? '';
  }

  readonly encoded = $derived.by(() =>
    encode(this.text, this.dataset.alphabet, this.dataset.maxSteps),
  );
  readonly steps: TimeStep[] = $derived.by(() => {
    const steps = run(
      this.dataset.weights,
      this.dataset.alphabet,
      this.encoded.indexes,
    );
    return steps.map((s, t) => ({
      ...s,
      id: t + 1,
      probabilities: softmax(s.logits, this.temperature),
      next: steps[t + 1]?.index ?? null,
    }));
  });
  /** Average surprise, in bits, at each character that came next. */
  readonly averageSurprise = $derived.by(() => {
    const known = this.steps.filter((s) => s.next !== null);
    if (known.length === 0) return 0;
    return (
      known.reduce((t, s) => t + surprise(s.probabilities[s.next ?? 0]), 0) /
      known.length
    );
  });
  /** The surprise of a blind guess among all the characters. */
  readonly blindSurprise = $derived.by(() =>
    Math.log2(this.dataset.alphabet.length),
  );
  readonly full = $derived.by(
    () => this.encoded.indexes.length >= this.dataset.maxSteps,
  );

  readonly selectedStep = $derived(
    this.selection?.kind === 'item'
      ? this.steps.find((s) => s.id === (this.selection?.id ?? -1))
      : undefined,
  );
  /** The step the bars and equations explain: the selected one, or the last. */
  readonly shown = $derived(this.selectedStep ?? this.steps.at(-1));
  readonly highlight = $derived(
    this.selection?.kind === 'symbol' ? this.selection.id : null,
  );

  setText(text: string): void {
    this.text = text;
  }

  setTemperature(value: number): void {
    const { min, max, step } = this.dataset.temperature;
    this.temperature = snap(clamp(value, min, max), step);
  }

  /** Adds one character, picked at random by the chances after the last one. */
  write(): void {
    const last = this.steps.at(-1);
    if (!last || this.full) return;
    const random = mulberry32(this.dataset.seed + this.writes)();
    this.writes += 1;
    this.text += this.dataset.alphabet[sample(last.probabilities, random)];
    this.selection = null;
  }

  nextExample(): void {
    this.exampleIndex = (this.exampleIndex + 1) % this.dataset.examples.length;
    this.reset();
  }

  reset(): void {
    this.text = this.dataset.examples[this.exampleIndex] ?? '';
    this.temperature = this.dataset.temperature.initial;
    this.writes = 0;
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
