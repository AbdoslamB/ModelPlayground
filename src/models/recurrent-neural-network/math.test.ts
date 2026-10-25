import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Weights } from './math';

import fixtures from '../../../tests/fixtures/recurrent-neural-network.json';
import rnn from './data/rnn.json';
import { encode, run, sample, softmax, step, surprise, top } from './math';

const W = rnn.weights;

describe.each(fixtures)('"$text" matches the trained network', (fixture) => {
  const { indexes } = encode(fixture.text, rnn.alphabet);
  const steps = run(W, rnn.alphabet, indexes);

  it('has the same hidden state after every character', () => {
    expect(steps).toHaveLength(fixture.hidden.length);
    steps.forEach((s, t) => {
      s.hidden.forEach((v, k) => {
        expect(v).toBeCloseTo(fixture.hidden[t]?.[k] ?? NaN, 12);
      });
    });
  });

  it('has the same scores and chances at every temperature', () => {
    steps.forEach((s, t) => {
      s.logits.forEach((v, k) => {
        expect(v).toBeCloseTo(fixture.logits[t]?.[k] ?? NaN, 12);
      });
      for (const [temperature, chances] of Object.entries(
        fixture.probabilities,
      )) {
        softmax(s.logits, Number(temperature)).forEach((p, k) => {
          expect(p).toBeCloseTo(chances[t]?.[k] ?? NaN, 12);
        });
      }
    });
  });
});

describe('data', () => {
  it('knows lower-case letters, the space and the full stop', () => {
    expect(rnn.alphabet).toMatch(/^[ .a-z]+$/);
    expect(rnn.alphabet).toContain(' ');
    expect(rnn.alphabet).toContain('.');
  });

  it('has weights of the right shapes', () => {
    const V = rnn.alphabet.length;
    const H = rnn.hidden;
    expect(W.Wx).toHaveLength(H);
    expect(W.Wx[0]).toHaveLength(V);
    expect(W.Wh).toHaveLength(H);
    expect(W.Wh[0]).toHaveLength(H);
    expect(W.Wy).toHaveLength(V);
    expect(W.Wy[0]).toHaveLength(H);
    expect(W.b).toHaveLength(H);
    expect(W.c).toHaveLength(V);
  });

  it('has learned something: after "the c" it expects "a"', () => {
    const steps = run(W, rnn.alphabet, encode('the c', rnn.alphabet).indexes);
    const last = steps.at(-1);
    if (!last) throw new Error('no steps');
    expect(top(softmax(last.logits), rnn.alphabet, 1)[0]?.char).toBe('a');
  });
});

describe('examples', () => {
  it('reads only what it knows, up to a limit', () => {
    expect(encode('Hi! 7', 'hi ')).toEqual({
      indexes: [0, 1, 2],
      skipped: ['!', '7'],
    });
    expect(encode('hihi', 'hi', 3).indexes).toEqual([0, 1, 0]);
  });

  it('runs one step: tanh of the weighted inputs', () => {
    const tiny: Weights = {
      Wx: [[1, 0]],
      Wh: [[0.5]],
      b: [0],
      Wy: [[2], [-2]],
      c: [0, 1],
    };
    const out = step(tiny, 0, [1]);
    expect(out.hidden[0]).toBeCloseTo(Math.tanh(1.5), 15);
    expect(out.logits).toEqual([
      2 * (out.hidden[0] ?? 0),
      -2 * (out.hidden[0] ?? 0) + 1,
    ]);
  });

  it('sharpens with a low temperature and flattens with a high one', () => {
    const z = [2, 1, 0];
    const cold = softmax(z, 0.2);
    const hot = softmax(z, 5);
    expect(cold[0]).toBeGreaterThan(0.99);
    expect(hot[0]).toBeLessThan(0.45);
  });

  it('lists the most likely characters, ties by alphabet order', () => {
    expect(top([0.2, 0.5, 0.2, 0.1], 'abcd', 3).map((t) => t.char)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('measures surprise in bits', () => {
    expect(surprise(1)).toBe(-0);
    expect(surprise(0.5)).toBe(1);
    expect(surprise(0.25)).toBe(2);
  });

  it('samples by walking the chances', () => {
    expect(sample([0.2, 0.5, 0.3], 0.1)).toBe(0);
    expect(sample([0.2, 0.5, 0.3], 0.6)).toBe(1);
    expect(sample([0.2, 0.5, 0.3], 0.9)).toBe(2);
    // Rounding can leave the total a hair under 1.
    expect(sample([0.3, 0.3, 0.3], 0.95)).toBe(2);
  });
});

describe('properties', () => {
  const scores = fc.array(fc.double({ min: -20, max: 20, noNaN: true }), {
    minLength: 2,
    maxLength: 30,
  });
  const temperature = fc.double({ min: 0.2, max: 2, noNaN: true });

  it('softmax gives chances that add up to 1, in the order of the scores', () => {
    fc.assert(
      fc.property(scores, temperature, (z, T) => {
        const p = softmax(z, T);
        expect(p.reduce((t, v) => t + v, 0)).toBeCloseTo(1, 12);
        z.forEach((a, i) => {
          z.forEach((b, j) => {
            if (a > b) expect(p[i]).toBeGreaterThanOrEqual(p[j] ?? 0);
          });
        });
      }),
    );
  });

  it('every hidden number stays between −1 and 1', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (text) => {
        const steps = run(W, rnn.alphabet, encode(text, rnn.alphabet).indexes);
        for (const s of steps) {
          for (const v of s.hidden) {
            expect(Math.abs(v)).toBeLessThanOrEqual(1);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
