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
import { read, tokenize, train } from './math';
import { plainPython, sklearnPython } from './python';

const dataset = datasets[0];
if (!dataset) throw new Error('no data');
const model = train(dataset.training);

function data(message: string, alpha = 1, off: string[] = []): PythonData {
  return {
    title: dataset.title,
    training: dataset.training,
    message,
    alpha,
    off,
  };
}

const cases = [
  data(dataset.examples[0] ?? ''),
  data(dataset.examples[1] ?? '', 0.3),
  data(dataset.examples[2] ?? '', 2, ['lunch']),
  data('Win WIN a free free prize, now!', 1, ['free']),
  data('nothing known here zzz'),
];

/** Printed to 2 decimals, or as a percentage to 1. */
function near(printed: number | undefined, value: number, unit: number) {
  expect(Math.abs((printed ?? NaN) - value)).toBeLessThanOrEqual(
    unit / 2 + 1e-9,
  );
}

describe('the Python versions print the Lab’s numbers', () => {
  it.skipIf(!python)('plain Python', () => {
    for (const d of cases) {
      const { out, ok, error } = runPython(plainPython(d));
      expect(ok, error).toBe(true);
      const printed = lines(out);
      const reading = read(model, d.message, d.alpha, d.off);
      near(numbers(printed[0])[0], reading.prior, 0.01);
      // One line per word of the message, in order.
      const words = tokenize(d.message);
      words.forEach((word, i) => {
        const term = reading.terms.find((t) => t.word === word);
        const line = printed[i + 1] ?? '';
        expect(line.startsWith(`${word}: `)).toBe(true);
        if (!term?.known) expect(line).toContain('never seen');
        else if (!term.counted) expect(line).toContain('switched off');
        else near(numbers(line.slice(word.length))[0], term.evidence, 0.01);
      });
      near(numbers(printed[words.length + 1])[0], reading.logOdds, 0.01);
      near(numbers(printed.at(-1)).at(-1), 100 * reading.spamChance, 0.1);
    }
  });

  it.skipIf(!hasModule('sklearn'))('scikit-learn', { timeout: 60_000 }, () => {
    for (const d of cases.slice(0, 4)) {
      const { out, ok, error } = runPython(sklearnPython(d));
      expect(ok, error).toBe(true);
      const [chance, verdict] = lines(out);
      const reading = read(model, d.message, d.alpha, d.off);
      near(numbers(chance)[0], 100 * reading.spamChance, 0.1);
      expect(verdict).toBe(
        `Verdict: ${reading.spamChance >= 0.5 ? 'spam' : 'normal'}`,
      );
    }
  });
});

describe('the code text', () => {
  it('holds the message, α and the switched-off words', () => {
    const code = plainPython(data('say "hi" now', 0.5, ['free', 'win']));
    expect(code).toContain('message = "say \\"hi\\" now"');
    expect(code).toContain('alpha = 0.5');
    expect(code).toContain('off = ["free", "win"]');
    expect(code).toContain('("win a free prize now", "spam"),');
  });
});
