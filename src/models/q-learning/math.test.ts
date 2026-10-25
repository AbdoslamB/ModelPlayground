import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Params, Rewards, World } from './math';

import fixtures from '../../../tests/fixtures/q-learning.json';
import data from './data/mazes.json';
import {
  best,
  choose,
  greedyPath,
  learn,
  move,
  shortestPath,
  train,
  valueIteration,
} from './math';

const rewards: Rewards = data.rewards;
const params: Params = {
  alpha: data.alpha.initial,
  gamma: data.gamma.initial,
  epsilon: data.epsilon.initial,
};

const mazes = data.mazes.map((world, index) => ({
  name: `maze ${index + 1}`,
  world: world,
  fixture: fixtures[index],
}));

describe.each(mazes)('$name matches the Python run', ({ world, fixture }) => {
  if (!fixture) throw new Error('missing fixture');

  it.each(Object.keys(fixture.afterSteps))(
    'after %s steps: the same Q-table, position and episode',
    (steps) => {
      const expected = fixture.afterSteps[steps as '0'];
      const ours = train(
        world,
        rewards,
        params,
        data.seed,
        data.maxEpisodeSteps,
        {
          steps: Number(steps),
        },
      );
      expect(ours.steps).toBe(expected.steps);
      expect(ours.episode).toBe(expected.episode);
      expect(ours.position).toBe(expected.position);
      ours.Q.forEach((q, cell) => {
        q.forEach((value, a) => {
          expect(value).toBeCloseTo(expected.Q[cell]?.[a] ?? NaN, 12);
        });
      });
    },
  );

  it('finds a shortest safe path after its training episodes', () => {
    const { episodes, steps, path } = fixture.afterEpisodes;
    const ours = train(
      world,
      rewards,
      params,
      data.seed,
      data.maxEpisodeSteps,
      {
        episodes,
      },
    );
    expect(ours.steps).toBe(steps);
    const greedy = greedyPath(world, rewards, ours.Q);
    expect(greedy).toEqual({ cells: path, reached: true });
    expect(greedy.cells.length - 1).toBe(fixture.shortest);
    expect(shortestPath(world, rewards)).toBe(fixture.shortest);
  });

  it('value iteration gives the exact Q-values', () => {
    const star = valueIteration(world, rewards, params.gamma);
    star.forEach((q, cell) => {
      q.forEach((value, a) => {
        expect(value).toBeCloseTo(fixture.valueIteration[cell]?.[a] ?? NaN, 9);
      });
    });
    const path = greedyPath(world, rewards, star);
    expect(path.reached).toBe(true);
    expect(path.cells.length - 1).toBe(fixture.shortest);
  });
});

describe('examples', () => {
  // A 3 × 1 corridor: start on the left, cheese on the right.
  const corridor: World = {
    columns: 3,
    rows: 1,
    start: 0,
    goal: 2,
    walls: [],
    cats: [],
  };

  it('moves, blocks at walls and edges, and ends at the cheese or a cat', () => {
    expect(move(corridor, rewards, 0, 1)).toEqual({
      next: 1,
      reward: -1,
      done: false,
    });
    expect(move(corridor, rewards, 0, 0)).toEqual({
      next: 0,
      reward: -1,
      done: false,
    });
    expect(move(corridor, rewards, 0, 3)).toEqual({
      next: 0,
      reward: -1,
      done: false,
    });
    expect(move(corridor, rewards, 1, 1)).toEqual({
      next: 2,
      reward: 10,
      done: true,
    });
    const walled = { ...corridor, walls: [1] };
    expect(move(walled, rewards, 0, 1).next).toBe(0);
    const cat = { ...corridor, cats: [1] };
    expect(move(cat, rewards, 0, 1)).toEqual({
      next: 1,
      reward: -10,
      done: true,
    });
    expect(move(corridor, rewards, 0, 2).next).toBe(0);
  });

  it('chooses the best move, breaks ties and explores at random', () => {
    expect(choose([0, 5, 1, 2], 0, () => 0.99)).toEqual({
      action: 1,
      explored: false,
    });
    // Two tied: the random number picks between them.
    expect(choose([5, 5, 1, 2], 0, () => 0.1).action).toBe(0);
    expect(choose([5, 5, 1, 2], 0, () => 0.9).action).toBe(1);
    // Explore: the first number is below ε, the second picks the move.
    const numbers = [0.01, 0.8];
    expect(choose([0, 5, 1, 2], 0.5, () => numbers.shift() ?? 0)).toEqual({
      action: 3,
      explored: true,
    });
  });

  it('learns one step: Q ← Q + α (r + γ max Q′ − Q)', () => {
    const Q = [
      [0, 2, 0, 0],
      [0, 4, 0, 0],
      [0, 0, 0, 0],
    ];
    const update = learn(
      Q,
      0,
      1,
      { next: 1, reward: -1, done: false },
      { alpha: 0.5, gamma: 0.9, epsilon: 0 },
    );
    expect(update.future).toBe(4);
    expect(update.target).toBeCloseTo(2.6, 12);
    expect(update.after).toBeCloseTo(2.3, 12);
    expect(Q[0]?.[1]).toBeCloseTo(2.3, 12);
    const end = learn(
      Q,
      1,
      1,
      { next: 2, reward: 10, done: true },
      {
        alpha: 1,
        gamma: 0.9,
        epsilon: 0,
      },
    );
    expect(end.future).toBe(0);
    expect(end.after).toBe(10);
  });

  it('ends an episode after too many moves, and starts again', () => {
    const blocked: World = { ...corridor, walls: [1] };
    const run = train(blocked, rewards, params, 1, 5, { steps: 12 });
    expect(run.episode).toBe(2);
    expect(run.steps).toBe(12);
    expect(run.last?.reward).toBe(-1);
    expect(
      train(corridor, rewards, params, 1, 5, { steps: 0 }).last,
    ).toBeNull();
  });

  it('greedy paths can fail, and some mazes have no safe path', () => {
    const blocked: World = { ...corridor, walls: [1] };
    const Q = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    expect(greedyPath(blocked, rewards, Q, 3)).toEqual({
      cells: [0, 0, 0, 0],
      reached: false,
    });
    expect(shortestPath(blocked, rewards)).toBeNull();
    const trap: World = { ...corridor, cats: [1] };
    expect(
      greedyPath(trap, rewards, [
        [0, 1, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]),
    ).toEqual({
      cells: [0, 1],
      reached: false,
    });
  });

  it('finds the best of four values', () => {
    expect(best([-3, -1, -2, -5])).toBe(-1);
  });
});

describe('properties', () => {
  const world = data.mazes[0];
  const runs = { numRuns: 60 };

  it('every Q-value stays between the worst and best possible returns', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3000 }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        fc.double({ min: 0.5, max: 0.99, noNaN: true }),
        (steps, alpha, gamma) => {
          const { Q } = train(
            world,
            rewards,
            { alpha, gamma, epsilon: 0.1 },
            3,
            data.maxEpisodeSteps,
            { steps },
          );
          const low = Math.min(rewards.cat, rewards.step / (1 - gamma));
          for (const q of Q) {
            for (const v of q) {
              expect(v).toBeGreaterThanOrEqual(low - 1e-9);
              expect(v).toBeLessThanOrEqual(rewards.goal + 1e-9);
            }
          }
        },
      ),
      runs,
    );
  });

  it('training is the same when stopped and asked again', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2000 }), (steps) => {
        const a = train(world, rewards, params, 9, data.maxEpisodeSteps, {
          steps,
        });
        const b = train(world, rewards, params, 9, data.maxEpisodeSteps, {
          steps,
        });
        expect(a).toEqual(b);
      }),
      { numRuns: 20 },
    );
  });
});
