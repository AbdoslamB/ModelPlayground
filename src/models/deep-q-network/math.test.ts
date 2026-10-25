import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Net, Sample, World } from './math';

import fixtures from '../../../tests/fixtures/deep-q-network.json';
import fields from './data/fields.json';
import {
  advance,
  argmax,
  copyNet,
  features,
  forward,
  greedyPath,
  initNet,
  lossAndGradient,
  move,
  qTable,
  shortestPath,
  train,
} from './math';

const { rewards, settings } = fields;

const worlds = fields.worlds.map((world, index) => ({
  name: `field ${index + 1}`,
  world: world,
  fixture: fixtures[index],
}));

describe.each(worlds)('$name matches the Python run', ({ world, fixture }) => {
  if (!fixture) throw new Error('missing fixture');

  it.each(Object.keys(fixture.snapshots))(
    'after %s steps: the same weights, Q-values and episodes',
    (steps) => {
      const expected = fixture.snapshots[steps as '1'];
      const ours = train(
        world,
        rewards,
        settings,
        fixture.epsilon,
        Number(steps),
      );
      const pairs: [number[][], number[][]][] = [
        [ours.net.W1, expected.net.W1],
        [ours.net.W2, expected.net.W2],
        [[ours.net.b1], [expected.net.b1]],
        [[ours.net.b2], [expected.net.b2]],
        [qTable(ours.net, world), expected.Q],
      ];
      for (const [a, b] of pairs) {
        a.forEach((row, i) => {
          row.forEach((v, j) => {
            expect(v).toBeCloseTo(b[i]?.[j] ?? NaN, 12);
          });
        });
      }
      expect(ours.episodes).toEqual(expected.episodes);
      expect(ours.position).toBe(expected.position);
    },
  );

  it('gives the same result when training stops and carries on', () => {
    const whole = train(world, rewards, settings, fixture.epsilon, 600);
    const half = train(world, rewards, settings, fixture.epsilon, 250);
    const rest = advance(half, world, rewards, settings, fixture.epsilon, 600);
    expect(rest).toEqual(whole);
    // Asking for fewer steps than already taken changes nothing.
    expect(
      advance(rest, world, rewards, settings, fixture.epsilon, 10).steps,
    ).toBe(600);
  });

  it('ends on a shortest safe path', () => {
    const ours = train(
      world,
      rewards,
      settings,
      fixture.epsilon,
      fields.steps.max,
    );
    const path = greedyPath(world, rewards, qTable(ours.net, world));
    expect(path).toEqual({ cells: fixture.path, reached: true });
    expect(shortestPath(world, rewards)).toBe(fixture.shortest);
  });
});

describe('examples', () => {
  const field: World = { columns: 3, rows: 2, start: 3, goal: 2, cats: [1] };

  it('moves, stays put at the edges, and ends at the cheese or a cat', () => {
    expect(move(field, rewards, 3, 1)).toEqual({
      next: 4,
      reward: -1,
      done: false,
    });
    expect(move(field, rewards, 3, 3)).toEqual({
      next: 3,
      reward: -1,
      done: false,
    });
    expect(move(field, rewards, 5, 0)).toEqual({
      next: 2,
      reward: 10,
      done: true,
    });
    expect(move(field, rewards, 4, 0)).toEqual({
      next: 1,
      reward: -10,
      done: true,
    });
  });

  it('sees a square as its column and row, from 0 to 1', () => {
    expect(features(field, 0)).toEqual([0, 0]);
    expect(features(field, 5)).toEqual([1, 1]);
    expect(features(field, 4)).toEqual([0.5, 1]);
  });

  it('runs the network forward with ReLU', () => {
    const net: Net = {
      W1: [[1, -1]],
      b1: [0],
      W2: [[2], [0], [0], [-1]],
      b2: [0, 1, 0, 0],
    };
    expect(forward(net, [0.5, 0])).toEqual({
      hidden: [0.5],
      q: [1, 1, 0, -0.5],
    });
    expect(forward(net, [0, 0.5]).hidden).toEqual([0]);
  });

  it('picks the first of the best moves', () => {
    expect(argmax([1, 3, 3, 0])).toBe(1);
    expect(argmax([-1, -2, -3, -4])).toBe(0);
  });

  it('copies a network without sharing its arrays', () => {
    const net = initNet(3, () => 0.75);
    const copy = copyNet(net);
    copy.W1[0][0] = 99;
    expect(net.W1[0]?.[0]).toBeCloseTo(0.5 * Math.sqrt(0.5), 15);
  });

  it('has no batch before the buffer holds one', () => {
    const run = train(field, rewards, { ...settings, batch: 50 }, 0.2, 10);
    expect(run.batch).toEqual([]);
    expect(run.loss).toBeNull();
  });

  it('finds no path when the cats block the way, or the network goes round in circles', () => {
    const blocked: World = {
      columns: 3,
      rows: 1,
      start: 0,
      goal: 2,
      cats: [1],
    };
    expect(shortestPath(blocked, rewards)).toBeNull();
    const still = [
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
    ];
    expect(greedyPath(blocked, rewards, still, 3)).toEqual({
      cells: [0, 0, 0, 0],
      reached: false,
    });
    const intoCat = [
      [0, 1, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    expect(greedyPath(blocked, rewards, intoCat)).toEqual({
      cells: [0, 1],
      reached: false,
    });
  });
});

describe('properties', () => {
  const world = fields.worlds[0];
  const sample = fc.record({
    cell: fc.integer({ min: 0, max: 24 }),
    action: fc.integer({ min: 0, max: 3 }),
    target: fc.double({ min: -10, max: 10, noNaN: true }),
  });

  it('backpropagation matches the loss’s slope, weight by weight', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.array(sample, { minLength: 1, maxLength: 6 }),
        (seed, list) => {
          let state = seed;
          const random = () => {
            state = (state * 9301 + 49297) % 233280;
            return state / 233280;
          };
          const net = initNet(6, random);
          net.b1 = net.b1.map((_, j) => (j % 2 ? 0.3 : -0.2));
          const samples: Sample[] = list.map((s) => ({
            ...s,
            reward: 0,
            next: 0,
            done: true,
            future: 0,
            prediction: 0,
            error: 0,
            loss: 0,
          }));
          const { grad } = lossAndGradient(net, world, samples);
          const h = 1e-6;
          const keys = ['W1', 'W2'] as const;
          for (const key of keys) {
            net[key].forEach((row, i) => {
              row.forEach((w, j) => {
                row[j] = w + h;
                const up = lossAndGradient(net, world, samples).loss;
                row[j] = w - h;
                const down = lossAndGradient(net, world, samples).loss;
                row[j] = w;
                const slope = (up - down) / (2 * h);
                // ReLU has a kink at 0; skip weights sitting right on it.
                if (Math.abs(slope - (grad[key][i]?.[j] ?? 0)) > 1e-4) {
                  const kink = list.some(
                    (s) =>
                      Math.abs(
                        forward(net, features(world, s.cell)).hidden[i] ?? 1,
                      ) < 1e-5,
                  );
                  expect(kink).toBe(true);
                }
              });
            });
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('training is the same when asked again', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        (steps, epsilon) => {
          expect(train(world, rewards, settings, epsilon, steps)).toEqual(
            train(world, rewards, settings, epsilon, steps),
          );
        },
      ),
      { numRuns: 20 },
    );
  });
});
