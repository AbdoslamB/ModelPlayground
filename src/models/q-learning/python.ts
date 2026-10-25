/**
 * The Python versions of the Lab, as text. They replay the Lab's training
 * from scratch: its maze, α, γ, ε, steps and random numbers (mulberry32),
 * so the Q-values they print are the Lab's. python.test.ts checks that.
 */
import type { Params, Rewards, World } from './math';

import { pyNumber } from '../../lib/pycode';

export interface PythonData {
  title: string;
  world: World;
  rewards: Rewards;
  params: Params;
  seed: number;
  maxEpisodeSteps: number;
  /** How many updates the Lab has made. */
  steps: number;
}

const list = (values: readonly number[]) => `[${values.join(', ')}]`;

function head(data: PythonData): string {
  const { world, rewards, params } = data;
  return `# ${data.title}: ${world.columns} × ${world.rows} squares, numbered row by row from the top left
columns, rows = ${world.columns}, ${world.rows}
start, cheese = ${world.start}, ${world.goal}
walls = ${list(world.walls)}
cats = ${list(world.cats)}
step_reward, cheese_reward, cat_reward = ${rewards.step}, ${rewards.goal}, ${rewards.cat}
alpha, gamma, epsilon = ${pyNumber(params.alpha)}, ${pyNumber(params.gamma)}, ${pyNumber(params.epsilon)}
steps = ${data.steps}  # how far the Lab has trained
max_moves = ${data.maxEpisodeSteps}  # an episode also ends after this many moves

def mulberry32(seed):
    """The Lab's random numbers: the same seed always gives the same ones."""
    state = seed
    def random():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (1 | state)) & 0xFFFFFFFF
        t = ((t + ((t ^ (t >> 7)) * (61 | t) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return random

MOVES = [(-1, 0), (0, 1), (1, 0), (0, -1)]
ARROWS = "↑→↓←"  # up, right, down, left

def name(cell):
    """A1 is the top-left square: letters across, numbers down."""
    return "ABCDEFGHIJ"[cell % columns] + str(cell // columns + 1)

def move(cell, action):
    """Where a move leads, its reward, and whether the episode ends."""
    r, c = cell // columns + MOVES[action][0], cell % columns + MOVES[action][1]
    if 0 <= r < rows and 0 <= c < columns and r * columns + c not in walls:
        cell = r * columns + c  # walls and the edge block the move
    if cell == cheese:
        return cell, cheese_reward, True
    if cell in cats:
        return cell, cat_reward, True
    return cell, step_reward, False

random = mulberry32(${data.seed})`;
}

/** The same printout for both: the last update, the start square, the path. */
const report = (
  argmax: string,
) => `print(f"Trained {steps} steps: {episode} episodes finished")
if last:
    cell, action, before, reward, future = last
    print(f"Last update: Q({name(cell)}, {ARROWS[action]}) ← {before:.2f} + {alpha:g} × "
          f"({reward} + {gamma:g} × {future:.2f} − ({before:.2f})) = {Q[cell][action]:.2f}")
print(f"{name(start)}: Q = " + ", ".join(f"{a} {q:.2f}" for a, q in zip(ARROWS, Q[start])))

# The best path: from the start, always take the best move (the first on a tie)
path, cell, done = [start], start, False
while not done and len(path) <= 40:
    cell, _, done = move(cell, ${argmax})
    path.append(cell)
if path[-1] == cheese:
    print(f"Best path from the start: {len(path) - 1} steps: " + " → ".join(map(name, path)))
else:
    print("Best path from the start: none yet")`;

/** With NumPy: the Q-table is an array. */
export function numpyPython(data: PythonData): string {
  return `import numpy as np

${head(data)}
Q = np.zeros((columns * rows, 4))  # Q[square, move]: how good each move looks
position, episode, moves, last = start, 0, 0, None
for _ in range(steps):
    if random() < epsilon:
        action = int(random() * 4)  # explore: a random move
    else:
        ties = np.flatnonzero(Q[position] == Q[position].max())  # the best moves
        action = ties[0] if len(ties) == 1 else ties[int(random() * len(ties))]
    nxt, reward, done = move(position, action)
    future = 0 if done else Q[nxt].max()
    before = Q[position, action]
    # Q(s, a) ← Q(s, a) + α [r + γ maxₐ′ Q(s′, a′) − Q(s, a)]
    Q[position, action] = before + alpha * (reward + gamma * future - before)
    last = (position, action, before, reward, future)
    moves += 1
    position = nxt
    if done or moves >= max_moves:
        episode, moves, position = episode + 1, 0, start

${report('int(np.argmax(Q[cell]))')}
`;
}

/** Plain Python, no libraries: the Q-table is a list of lists. */
export function plainPython(data: PythonData): string {
  return `${head(data)}
Q = [[0.0] * 4 for _ in range(columns * rows)]  # Q[square][move]
position, episode, moves, last = start, 0, 0, None
for _ in range(steps):
    if random() < epsilon:
        action = int(random() * 4)  # explore: a random move
    else:
        top = max(Q[position])
        ties = [a for a in range(4) if Q[position][a] == top]  # the best moves
        action = ties[0] if len(ties) == 1 else ties[int(random() * len(ties))]
    nxt, reward, done = move(position, action)
    future = 0 if done else max(Q[nxt])
    before = Q[position][action]
    # Q(s, a) ← Q(s, a) + α [r + γ maxₐ′ Q(s′, a′) − Q(s, a)]
    Q[position][action] = before + alpha * (reward + gamma * future - before)
    last = (position, action, before, reward, future)
    moves += 1
    position = nxt
    if done or moves >= max_moves:
        episode, moves, position = episode + 1, 0, start

${report('Q[cell].index(max(Q[cell]))')}
`;
}
