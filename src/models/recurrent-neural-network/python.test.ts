import { describe, expect, it } from 'vitest';

import type { PythonData } from './python';

import {
  hasModule,
  lines,
  numbers,
  python,
  runPython,
} from '../../../tests/unit/run-python';
import { datasets } from './data';
import { encode, run, softmax, surprise, top } from './math';
import { numpyPython, plainPython } from './python';

const dataset = datasets[0];
if (!dataset) throw new Error('no data');
const { alphabet } = dataset;

function data(text: string, temperature = 1): PythonData {
  return {
    title: dataset.title,
    question: dataset.question,
    text,
    temperature,
    alphabet,
    weights: dataset.weights,
    maxSteps: dataset.maxSteps,
  };
}

const show = (char: string) => (char === ' ' ? '␣' : char);
const percent = (p: number) =>
  p < 0.01 ? `${(100 * p).toFixed(1)}%` : `${(100 * p).toFixed(0)}%`;

/** The Lab's steps, as the programs print them. */
function expected(d: PythonData) {
  const { indexes } = encode(d.text, alphabet, d.maxSteps);
  const steps = run(d.weights, alphabet, indexes).map((s) => ({
    ...s,
    p: softmax(s.logits, d.temperature),
  }));
  const rows = steps.map((s, t) => {
    const best = top(s.p, alphabet, 3);
    return { t: t + 1, char: s.char, best };
  });
  const bits = steps
    .slice(0, -1)
    .map((s, t) => surprise(s.p[steps[t + 1]?.index ?? 0] ?? NaN));
  return {
    rows,
    surprise: bits.length
      ? bits.reduce((a, b) => a + b, 0) / bits.length
      : null,
  };
}

const cases = [
  data(dataset.examples[0] ?? ''),
  data(dataset.examples[3] ?? '', 0.3),
  data('The Dog, RAN to the hill!', 1.7),
  data('x'),
  data(''),
];

function check(out: string, d: PythonData) {
  const printed = lines(out);
  const want = expected(d);
  if (want.rows.length === 0) {
    expect(printed[0]).toBe('Type something for the network to read.');
    return;
  }
  want.rows.forEach((row, i) => {
    const line = printed[i] ?? '';
    expect(
      line.startsWith(`${String(row.t).padStart(2)} ${show(row.char)} → `),
    ).toBe(true);
    // The chances may round differently in the last digit; the order may not.
    const guesses = line.split(' → ')[1]?.split(', ') ?? [];
    row.best.forEach((b, k) => {
      const [char, value] = (guesses[k] ?? '').split(' ');
      expect(char).toBe(show(b.char));
      expect(
        Math.abs(
          (numbers(value)[0] ?? NaN) - Number(percent(b.p).slice(0, -1)),
        ),
      ).toBeLessThanOrEqual(b.p < 0.01 ? 0.1 : 1);
    });
  });
  if (want.surprise !== null) {
    const [bits] = numbers(printed[want.rows.length]);
    expect(Math.abs((bits ?? NaN) - want.surprise)).toBeLessThanOrEqual(
      0.05 + 1e-9,
    );
  }
}

describe('the Python versions print the Lab’s chances', () => {
  it.skipIf(!python)('plain Python', { timeout: 60_000 }, () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(plainPython(d));
      expect(ok, error).toBe(true);
      check(out, d);
    }
  });

  it.skipIf(!hasModule('numpy'))('NumPy', { timeout: 60_000 }, () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(numpyPython(d));
      expect(ok, error).toBe(true);
      check(out, d);
    }
  });
});

describe('the code text', () => {
  it('holds the text, the temperature and the weights', () => {
    const code = plainPython(data('say "hi"', 0.5));
    expect(code).toContain('text = "say \\"hi\\""');
    expect(code).toContain('T = 0.5');
    expect(code).toContain(`    [${dataset.weights.Wh[0]?.join(', ')}],`);
    expect(numpyPython(data('a'))).toContain('Wh = np.array([');
  });
});
