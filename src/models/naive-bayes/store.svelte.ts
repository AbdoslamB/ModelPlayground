import type { ClassInfo, Dataset } from './data';
import type { Label, Model, Term } from './math';

import { clamp, snap } from '../../lib/format';
import { read, train, wordProbability } from './math';

export type Selection =
  | { kind: 'item'; id: number; source: 'graph' | 'table' }
  | { kind: 'symbol'; id: 'alpha' | 'L' };

/**
 * The Naive Bayes Lab's state. Input writes the message, α, the words that
 * are switched off and the selection; the model is learned once from the
 * training messages, and everything else is derived from it.
 */
export class BayesLab {
  readonly dataset: Dataset;
  readonly model: Model;

  exampleIndex = $state(0);
  text = $state('');
  alpha = $state(1);
  /** Words the learner switched off. */
  off = $state<string[]>([]);
  selection = $state<Selection | null>(null);

  constructor(dataset: Dataset) {
    this.dataset = dataset;
    this.model = train(dataset.training);
    this.alpha = dataset.alphas.initial;
    this.text = dataset.examples[0] ?? '';
  }

  readonly reading = $derived.by(() =>
    read(this.model, this.text, this.alpha, this.off),
  );
  /** One row per distinct word of the message, in message order. */
  readonly rows: Term[] = $derived(this.reading.terms);
  readonly counted = $derived(this.rows.filter((t) => t.counted));
  readonly ignored = $derived(this.rows.filter((t) => !t.known));
  readonly prediction: Label = $derived(
    this.reading.spamChance >= 0.5 ? 'spam' : 'normal',
  );

  readonly selectedRow = $derived(
    this.selection?.kind === 'item'
      ? this.rows.find((r) => r.id === (this.selection?.id ?? -1))
      : undefined,
  );
  readonly highlight = $derived(
    this.selection?.kind === 'symbol' ? this.selection.id : null,
  );
  readonly isStart = $derived.by(
    () =>
      this.text === (this.dataset.examples[this.exampleIndex] ?? '') &&
      this.alpha === this.dataset.alphas.initial &&
      this.off.length === 0,
  );

  classInfo(id: Label): ClassInfo | undefined {
    return this.dataset.classes.find((c) => c.id === id);
  }

  /** P(word | kind) at the current α. */
  chance(word: string, label: Label): number {
    return wordProbability(this.model, word, label, this.alpha);
  }

  setText(text: string): void {
    this.text = text;
  }

  setAlpha(value: number): void {
    const { min, max, step } = this.dataset.alphas;
    this.alpha = snap(clamp(value, min, max), step);
  }

  /** Switches a seen word off, or back on. Unseen words are always ignored. */
  toggle(word: string): void {
    if (!this.model.vocabulary.includes(word)) return;
    this.off = this.off.includes(word)
      ? this.off.filter((w) => w !== word)
      : [...this.off, word];
  }

  nextExample(): void {
    this.exampleIndex = (this.exampleIndex + 1) % this.dataset.examples.length;
    this.text = this.dataset.examples[this.exampleIndex] ?? '';
    this.off = [];
    this.selection = null;
  }

  reset(): void {
    this.text = this.dataset.examples[this.exampleIndex] ?? '';
    this.alpha = this.dataset.alphas.initial;
    this.off = [];
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
