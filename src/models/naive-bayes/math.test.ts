import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Label, Message } from './math';

import fixtures from '../../../tests/fixtures/naive-bayes.json';
import messages from './data/messages.json';
import {
  chanceFromLogOdds,
  prior,
  priorEvidence,
  read,
  tokenize,
  train,
  wordCount,
  wordEvidence,
  wordProbability,
} from './math';

const training = messages.training as Message[];
const model = train(training);
const alphas = Object.keys(fixtures.alphas) as (keyof typeof fixtures.alphas)[];

describe('matches scikit-learn', () => {
  it('splits text into the same words', () => {
    for (const { text, words } of fixtures.tokens) {
      expect(tokenize(text), text).toEqual(words);
    }
  });

  it('learns the same vocabulary', () => {
    expect(model.vocabulary).toEqual(fixtures.vocabulary);
  });

  describe.each(alphas)('α = %s', (key) => {
    const alpha = Number(key);
    const expected = fixtures.alphas[key];

    it('gives every word the same chance in each kind', () => {
      for (const label of ['spam', 'normal'] as const) {
        const chances = expected.wordProbability[label] as Record<
          string,
          number
        >;
        for (const word of model.vocabulary) {
          expect(wordProbability(model, word, label, alpha)).toBeCloseTo(
            chances[word] ?? NaN,
            12,
          );
        }
      }
    });

    it('starts from the same share of each kind', () => {
      expect(prior(model, 'spam')).toBeCloseTo(expected.classPrior.spam, 12);
      expect(prior(model, 'normal')).toBeCloseTo(
        expected.classPrior.normal,
        12,
      );
    });

    it('gives every example the same chance of spam', () => {
      messages.examples.forEach((text, i) => {
        expect(read(model, text, alpha).spamChance, text).toBeCloseTo(
          expected.spamChance[i] ?? NaN,
          10,
        );
      });
    });
  });
});

describe('data', () => {
  it('has 10 spam and 15 normal training messages', () => {
    expect(training.filter((m) => m.label === 'spam')).toHaveLength(10);
    expect(training.filter((m) => m.label === 'normal')).toHaveLength(15);
  });
});

describe('examples', () => {
  const tiny = train([
    { id: 1, text: 'free money', label: 'spam' },
    { id: 2, text: 'free', label: 'spam' },
    { id: 3, text: 'lunch money', label: 'normal' },
    { id: 4, text: 'lunch', label: 'normal' },
  ]);

  it('counts words in each kind', () => {
    expect(tiny.vocabulary).toEqual(['free', 'lunch', 'money']);
    expect(wordCount(tiny, 'free', 'spam')).toBe(2);
    expect(wordCount(tiny, 'free', 'normal')).toBe(0);
    expect(tiny.totals).toEqual({ spam: 3, normal: 3 });
    expect(tiny.messages).toEqual({ spam: 2, normal: 2 });
  });

  it('smooths: (count + α) ÷ (total + α × V)', () => {
    expect(wordProbability(tiny, 'free', 'spam', 1)).toBeCloseTo(3 / 6, 15);
    expect(wordProbability(tiny, 'free', 'normal', 1)).toBeCloseTo(1 / 6, 15);
    expect(wordEvidence(tiny, 'free', 1)).toBeCloseTo(Math.log(3), 15);
    expect(wordEvidence(tiny, 'money', 1)).toBeCloseTo(0, 15);
  });

  it('starts from even odds when both kinds are equally common', () => {
    expect(priorEvidence(tiny)).toBe(0);
  });

  it('reads each distinct word once, counting repeats', () => {
    const reading = read(tiny, 'Free FREE lunch, a pizza', 1);
    expect(reading.terms.map((t) => [t.word, t.times, t.order])).toEqual([
      ['free', 2, 0],
      ['lunch', 1, 1],
      ['pizza', 1, 2],
    ]);
    expect(reading.terms[0]?.contribution).toBeCloseTo(2 * Math.log(3), 15);
    expect(reading.logOdds).toBeCloseTo(Math.log(3), 15);
  });

  it('ignores words it never saw, after the vocabulary in id order', () => {
    const reading = read(tiny, 'pizza pasta pizza', 1);
    expect(reading.terms.map((t) => [t.id, t.known, t.contribution])).toEqual([
      [4, false, 0],
      [5, false, 0],
    ]);
    expect(reading.spamChance).toBe(0.5);
  });

  it('leaves out switched-off words, even when repeated', () => {
    const reading = read(tiny, 'free free lunch', 1, ['free']);
    expect(reading.terms[0]).toMatchObject({ counted: false, contribution: 0 });
    expect(reading.logOdds).toBeCloseTo(-Math.log(3), 15);
  });

  it('never mistakes built-in object names for words', () => {
    const reading = read(tiny, 'constructor toString __proto__', 1);
    expect(reading.terms.every((t) => !t.known)).toBe(true);
    expect(reading.logOdds).toBe(0);
  });

  it('turns log-odds into a chance, even far from zero', () => {
    expect(chanceFromLogOdds(0)).toBe(0.5);
    expect(chanceFromLogOdds(Math.log(3))).toBeCloseTo(0.75, 15);
    expect(chanceFromLogOdds(-Math.log(3))).toBeCloseTo(0.25, 15);
    expect(chanceFromLogOdds(1000)).toBe(1);
    expect(chanceFromLogOdds(-1000)).toBe(0);
  });
});

const words = fc.constantFrom(
  'free',
  'win',
  'lunch',
  'meeting',
  'today',
  'money',
  'zebra',
  'a',
);
const text = fc.array(words, { maxLength: 12 }).map((w) => w.join(' '));
const alpha = fc.double({ min: 0.01, max: 5, noNaN: true });

describe('properties', () => {
  const runs = { numRuns: 500 };

  it('the total is the start plus every word, and the chance matches it', () => {
    fc.assert(
      fc.property(text, alpha, (message, a) => {
        const reading = read(model, message, a);
        const sum = reading.terms.reduce(
          (t, term) => t + term.times * term.evidence,
          priorEvidence(model),
        );
        expect(reading.logOdds).toBeCloseTo(sum, 9);
        expect(reading.spamChance).toBeCloseTo(
          1 / (1 + Math.exp(-reading.logOdds)),
          12,
        );
      }),
      runs,
    );
  });

  it('switching a word off is the same as deleting it from the message', () => {
    fc.assert(
      fc.property(text, alpha, words, (message, a, word) => {
        const without = message
          .split(' ')
          .filter((w) => w !== word)
          .join(' ');
        expect(read(model, message, a, [word]).logOdds).toBeCloseTo(
          read(model, without, a).logOdds,
          9,
        );
      }),
      runs,
    );
  });

  it('word order does not matter: that is the naive part', () => {
    fc.assert(
      fc.property(fc.array(words, { maxLength: 12 }), alpha, (list, a) => {
        expect(
          read(model, [...list].reverse().join(' '), a).logOdds,
        ).toBeCloseTo(read(model, list.join(' '), a).logOdds, 9);
      }),
      runs,
    );
  });

  it('word chances in each kind add up to 1', () => {
    fc.assert(
      fc.property(
        alpha,
        fc.constantFrom<Label>('spam', 'normal'),
        (a, label) => {
          const total = model.vocabulary.reduce(
            (t, word) => t + wordProbability(model, word, label, a),
            0,
          );
          expect(total).toBeCloseTo(1, 12);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('with smoothing, no word is ever impossible or certain', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...model.vocabulary),
        fc.constantFrom<Label>('spam', 'normal'),
        alpha,
        (word, label, a) => {
          const p = wordProbability(model, word, label, a);
          expect(p).toBeGreaterThan(0);
          expect(p).toBeLessThan(1);
          expect(Number.isFinite(wordEvidence(model, word, a))).toBe(true);
        },
      ),
      runs,
    );
  });
});
