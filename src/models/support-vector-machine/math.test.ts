import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Grid, Kernel, Point } from './math';

import fixtures from '../../../tests/fixtures/support-vector-machine.json';
import students from './data/students.json';
import {
  contour,
  decide,
  kernel,
  marginWidth,
  objective,
  sampleGrid,
  slack,
  stepTo,
  supportVectors,
  train,
  weights,
} from './math';

const signOf = (label: string) => (label === 'pass' ? 1 : -1);

const cases = students.batches.flatMap((rows, index) =>
  (fixtures[index]?.settings ?? []).map((setting) => ({
    name: `set ${index + 1}, ${setting.kernel}, C = ${setting.C}${'gamma' in setting ? `, γ = ${setting.gamma}` : ''}`,
    rows,
    setting,
    fixture: fixtures[index],
  })),
);

// libsvm (inside scikit-learn) keeps the kernel matrix in single precision
// (float), so its answers carry rounding of about 1e-7 times the kernel's
// size; ours are in double precision. Curved (RBF) kernels are at most 1, so
// the two agree to about 1e-8; straight-border kernels reach about 200 here,
// so they agree to about 3e-4. The page shows 2 decimals, so both are exact
// for the learner.
function near(ours: number, theirs: number, kernelType: string) {
  const tolerance = kernelType === 'rbf' ? 1e-6 : 1e-3;
  expect(Math.abs(ours - theirs)).toBeLessThan(tolerance);
}

describe.each(cases)(
  '$name matches scikit-learn',
  ({ rows, setting, fixture }) => {
    if (!fixture) throw new Error('missing fixture');
    const k: Kernel =
      setting.kernel === 'rbf'
        ? { type: 'rbf', gamma: Number((setting as { gamma?: number }).gamma) }
        : { type: 'linear' };
    const machine = train(
      rows,
      rows.map((r) => signOf(r.label)),
      setting.C,
      k,
    );

    it('gives the same f(x) everywhere on a grid', () => {
      const [x0, x1] = fixture.gridAxes.x;
      const [y0, y1] = fixture.gridAxes.y;
      const n = fixture.gridSize;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const point = {
            x: x0 + ((x1 - x0) * i) / (n - 1),
            y: y0 + ((y1 - y0) * j) / (n - 1),
          };
          near(
            decide(machine, point),
            setting.grid[j * n + i] ?? NaN,
            setting.kernel,
          );
        }
      }
    });

    it('picks the same support vectors, with the same weights', () => {
      // scikit-learn lists support vectors grouped by class, so compare by id.
      const ours = supportVectors(machine);
      const ids = ours.map((i) => rows[i]?.id ?? NaN);
      expect([...ids].sort((p, q) => p - q)).toEqual(
        [...setting.support].sort((p, q) => p - q),
      );
      ours.forEach((i) => {
        const at = setting.support.indexOf(rows[i]?.id ?? NaN);
        near(machine.alpha[i] ?? NaN, setting.alpha[at] ?? NaN, setting.kernel);
      });
      near(machine.b, setting.intercept, setting.kernel);
    });
  },
);

describe('data', () => {
  it('every set has 24 students with both results', () => {
    for (const rows of students.batches) {
      expect(rows).toHaveLength(24);
      const passed = rows.filter((r) => r.label === 'pass').length;
      expect(passed).toBeGreaterThanOrEqual(9);
      expect(passed).toBeLessThanOrEqual(15);
    }
  });
});

describe('examples', () => {
  // Two points per side, mirror images across the line x = 2.
  const points: Point[] = [
    { x: 0, y: 0 },
    { x: 0, y: 2 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
  ];
  const signs = [-1, -1, 1, 1];
  const linear: Kernel = { type: 'linear' };

  it('measures the two kernels', () => {
    expect(kernel(linear, { x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
    expect(
      kernel({ type: 'rbf', gamma: 0.5 }, { x: 0, y: 0 }, { x: 2, y: 0 }),
    ).toBeCloseTo(Math.exp(-2), 15);
  });

  it('finds the widest street: the line x = 2, margin 4', () => {
    const machine = train(points, signs, 100, linear);
    const w = weights(machine);
    expect(w.x).toBeCloseTo(0.5, 9);
    expect(w.y).toBeCloseTo(0, 9);
    expect(machine.b).toBeCloseTo(-1, 9);
    expect(marginWidth(w)).toBeCloseTo(4, 9);
    expect(decide(machine, { x: 2, y: 7 })).toBeCloseTo(0, 9);
  });

  it('has no street when the border has no direction', () => {
    expect(marginWidth({ x: 0, y: 0 })).toBe(Infinity);
  });

  it('measures slack: 0 outside the margin, more the further inside', () => {
    expect(slack(1, 2)).toBe(0);
    expect(slack(1, 0.25)).toBe(0.75);
    expect(slack(-1, 0.5)).toBe(1.5);
  });

  it('adds up the objective: ½‖w‖² + C Σ ξ', () => {
    const machine = train(points, signs, 100, linear);
    const { size, slack: total, total: sum } = objective(machine, 100);
    expect(size).toBeCloseTo(0.125, 9);
    expect(total).toBeCloseTo(0, 9);
    expect(sum).toBeCloseTo(0.125, 9);
  });

  it('steps a point to a margin line along w', () => {
    const machine = train(points, signs, 100, linear);
    const target = stepTo(machine, { x: 1, y: 5 }, 1);
    expect(target.x).toBeCloseTo(4, 9);
    expect(target.y).toBeCloseTo(5, 9);
    const flat = { ...machine, alpha: [0, 0, 0, 0] };
    expect(stepTo(flat, { x: 1, y: 5 }, 1)).toEqual({ x: 1, y: 5 });
  });

  it('balances the intercept when no weight is strictly inside its bounds', () => {
    // One point per side, a tiny C: both weights stop at C.
    const machine = train(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      [-1, 1],
      0.01,
      linear,
    );
    expect(machine.alpha).toEqual([0.01, 0.01]);
    expect(machine.b).toBeCloseTo(-0.005, 12);
  });

  it('stops when it runs out of steps, or has nothing to learn', () => {
    expect(train(points, signs, 1, linear, 1e-9, 0).alpha).toEqual([
      0, 0, 0, 0,
    ]);
    expect(Math.abs(train([], [], 1, linear).b)).toBe(0);
    const same = train(points.slice(0, 2), [1, 1], 1, linear);
    expect(same.alpha).toEqual([0, 0]);
    // One class only: everything sits on that class's margin line.
    expect(same.b).toBe(1);
    expect(train(points.slice(0, 2), [-1, -1], 1, linear).b).toBe(-1);
  });

  it('copes with two points in the same place on opposite sides', () => {
    const machine = train(
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
      [1, -1],
      1,
      linear,
    );
    expect(decide(machine, { x: 1, y: 1 })).toBeCloseTo(0, 9);
  });

  it('traces a straight contour, and resolves saddles by the centre', () => {
    const grid: Grid = { x: [0, 2], y: [0, 2], columns: 2, lines: 2 };
    const values = [
      [-1, 0, 1],
      [-1, 0, 1],
      [-1, 0, 1],
    ];
    const lines = contour(values, grid, 0.5);
    expect(lines).toHaveLength(2);
    for (const [a, b] of lines) {
      expect(a.x).toBeCloseTo(1.5, 12);
      expect(b.x).toBeCloseTo(1.5, 12);
    }
    const one: Grid = { x: [0, 1], y: [0, 1], columns: 1, lines: 1 };
    const saddleUp = contour(
      [
        [1, -1],
        [-1, 1],
      ],
      one,
      -0.1,
    );
    const saddleDown = contour(
      [
        [1, -1],
        [-1, 1],
      ],
      one,
      0.1,
    );
    expect(saddleUp).toHaveLength(2);
    expect(saddleDown).toHaveLength(2);
    expect(saddleUp).not.toEqual(saddleDown);
    expect(contour([[1]], one, 0)).toEqual([]);
  });

  it('samples f on the corners of a grid, from the bottom', () => {
    const machine = train(points, signs, 100, linear);
    const values = sampleGrid(machine, {
      x: [0, 4],
      y: [0, 2],
      columns: 2,
      lines: 1,
    });
    expect(values).toHaveLength(2);
    expect(values[0]?.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([
      -1, 0, 1,
    ]);
  });
});

const dataArb = fc
  .array(
    fc.record({
      x: fc.double({ min: 0, max: 10, noNaN: true }),
      y: fc.double({ min: 0, max: 10, noNaN: true }),
      s: fc.constantFrom(-1, 1),
    }),
    { minLength: 2, maxLength: 20 },
  )
  .filter((list) => list.some((p) => p.s > 0) && list.some((p) => p.s < 0));

describe('properties', () => {
  const runs = { numRuns: 150 };

  it('the weights stay in 0 ≤ α ≤ C and balance: Σ αᵢyᵢ = 0', () => {
    fc.assert(
      fc.property(
        dataArb,
        fc.double({ min: 0.05, max: 20, noNaN: true }),
        (list, C) => {
          const machine = train(
            list,
            list.map((p) => p.s),
            C,
            { type: 'linear' },
          );
          let balance = 0;
          machine.alpha.forEach((a, i) => {
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThanOrEqual(C + 1e-12);
            balance += a * (machine.signs[i] ?? 0);
          });
          expect(Math.abs(balance)).toBeLessThan(1e-9 * Math.max(1, C));
        },
      ),
      runs,
    );
  });

  it('points with no weight sit on or outside their margin line', () => {
    fc.assert(
      fc.property(
        dataArb,
        fc.double({ min: 0.05, max: 20, noNaN: true }),
        (list, C) => {
          const machine = train(
            list,
            list.map((p) => p.s),
            C,
            {
              type: 'rbf',
              gamma: 0.3,
            },
          );
          list.forEach((p, i) => {
            if ((machine.alpha[i] ?? 0) === 0) {
              expect(p.s * decide(machine, p)).toBeGreaterThanOrEqual(1 - 1e-6);
            }
          });
        },
      ),
      runs,
    );
  });

  it('a straight border’s f(x) equals w · x + b', () => {
    fc.assert(
      fc.property(dataArb, (list) => {
        const machine = train(
          list,
          list.map((p) => p.s),
          1,
          { type: 'linear' },
        );
        const w = weights(machine);
        for (const p of list) {
          expect(decide(machine, p)).toBeCloseTo(
            w.x * p.x + w.y * p.y + machine.b,
            9,
          );
        }
      }),
      runs,
    );
  });
});
