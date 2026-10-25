/**
 * Naive Bayes math. Pure functions: no DOM, no state. Every number the
 * learner sees comes from here, and math.test.ts checks the word chances and
 * spam chances against scikit-learn's MultinomialNB.
 */

export type Label = 'normal' | 'spam';

export interface Message {
  id: number;
  text: string;
  label: Label;
}

/** What the model learns: how often each word appears in each kind. */
export interface Model {
  /** Every word seen in training, A to Z. */
  vocabulary: string[];
  /** How many times each word appears in each kind of message. */
  counts: Record<Label, Map<string, number>>;
  /** All the words in each kind of message, counting repeats. */
  totals: Record<Label, number>;
  /** How many messages of each kind. */
  messages: Record<Label, number>;
}

/**
 * Splits text into lower-case words of two or more letters or digits, as
 * scikit-learn's CountVectorizer does by default. One-letter words like "a"
 * are skipped.
 */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? [];
}

/** Counts every word in every training message. */
export function train(messages: readonly Message[]): Model {
  const counts: Model['counts'] = { normal: new Map(), spam: new Map() };
  const totals = { normal: 0, spam: 0 };
  const sizes = { normal: 0, spam: 0 };
  for (const message of messages) {
    const words = counts[message.label];
    sizes[message.label] += 1;
    for (const word of tokenize(message.text)) {
      words.set(word, (words.get(word) ?? 0) + 1);
      totals[message.label] += 1;
    }
  }
  const vocabulary = [
    ...new Set([...counts.spam.keys(), ...counts.normal.keys()]),
  ].sort();
  return { vocabulary, counts, totals, messages: sizes };
}

/** How many times a word appears in messages of one kind. */
export function wordCount(model: Model, word: string, label: Label): number {
  return model.counts[label].get(word) ?? 0;
}

/**
 * P(word | kind), with smoothing α: (count + α) ÷ (all words of that kind +
 * α × vocabulary size). Smoothing keeps a word never seen in one kind from
 * having a chance of exactly zero.
 */
export function wordProbability(
  model: Model,
  word: string,
  label: Label,
  alpha: number,
): number {
  return (
    (wordCount(model, word, label) + alpha) /
    (model.totals[label] + alpha * model.vocabulary.length)
  );
}

/** P(kind) before reading any words: the share of messages of that kind. */
export function prior(model: Model, label: Label): number {
  return model.messages[label] / (model.messages.spam + model.messages.normal);
}

/** The starting evidence: log(P(spam) ÷ P(normal)). */
export function priorEvidence(model: Model): number {
  return Math.log(prior(model, 'spam') / prior(model, 'normal'));
}

/**
 * One word's evidence: log(P(word | spam) ÷ P(word | normal)). Above zero
 * it points to spam; below zero, to normal.
 */
export function wordEvidence(
  model: Model,
  word: string,
  alpha: number,
): number {
  return Math.log(
    wordProbability(model, word, 'spam', alpha) /
      wordProbability(model, word, 'normal', alpha),
  );
}

/** Turns log-odds into a chance between 0 and 1, without overflowing. */
export function chanceFromLogOdds(logOdds: number): number {
  if (logOdds >= 0) return 1 / (1 + Math.exp(-logOdds));
  const e = Math.exp(logOdds);
  return e / (1 + e);
}

/** One distinct word of a message and what it adds. */
export interface Term {
  /** The word's place in the vocabulary + 1; unseen words come after it. */
  id: number;
  word: string;
  /** Its place in the message: 0 for the first word. */
  order: number;
  /** How many times it appears in the message. */
  times: number;
  /** Seen in training. Unseen words are ignored. */
  known: boolean;
  /** Known and not switched off. */
  counted: boolean;
  /** Evidence for one appearance (0 for an unseen word). */
  evidence: number;
  /** What it adds to the total: times × evidence, if counted. */
  contribution: number;
}

export interface Reading {
  /** The evidence before reading any words. */
  prior: number;
  terms: Term[];
  /** prior + every contribution. */
  logOdds: number;
  /** P(spam | the message). */
  spamChance: number;
}

/**
 * Reads a message: every distinct word, in order, with its evidence, and the
 * total. Words in `off` are left out, as if they were not in the message.
 */
export function read(
  model: Model,
  text: string,
  alpha: number,
  off: readonly string[] = [],
): Reading {
  const index = new Map(model.vocabulary.map((word, i) => [word, i + 1]));
  const terms: Term[] = [];
  let unseen = model.vocabulary.length;
  for (const word of tokenize(text)) {
    const found = terms.find((term) => term.word === word);
    if (found) {
      found.times += 1;
      found.contribution = found.counted ? found.times * found.evidence : 0;
      continue;
    }
    const id = index.get(word);
    const known = id !== undefined;
    const counted = known && !off.includes(word);
    const evidence = known ? wordEvidence(model, word, alpha) : 0;
    terms.push({
      id: id ?? (unseen += 1),
      word,
      order: terms.length,
      times: 1,
      known,
      counted,
      evidence,
      contribution: counted ? evidence : 0,
    });
  }
  const start = priorEvidence(model);
  const logOdds = terms.reduce((sum, term) => sum + term.contribution, start);
  return {
    prior: start,
    terms,
    logOdds,
    spamChance: chanceFromLogOdds(logOdds),
  };
}
