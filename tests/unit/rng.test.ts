import { describe, expect, it } from 'vitest';

import { mulberry32, resumable } from '../../src/lib/rng';

describe('mulberry32', () => {
  it('gives the same numbers as python/rng.py for the same seed', () => {
    const random = mulberry32(42);
    const numbers = Array.from({ length: 5 }, () => random());
    // From python/rng.py: mulberry32(42), five draws.
    const python = [
      0.60110375192, 0.448290558998, 0.85246579349, 0.669734041439,
      0.174813898746,
    ];
    numbers.forEach((n, i) => {
      expect(n).toBeCloseTo(python[i] ?? NaN, 11);
    });
  });

  it('stays between 0 and 1', () => {
    const random = mulberry32(-7);
    for (let i = 0; i < 1000; i++) {
      const n = random();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('can be saved part-way and carried on from the same place', () => {
    const whole = mulberry32(5);
    const first = resumable(5);
    first.random();
    first.random();
    const rest = resumable(first.state());
    whole();
    whole();
    expect(rest.random()).toBe(whole());
    expect(rest.random()).toBe(whole());
  });
});
