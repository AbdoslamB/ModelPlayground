/**
 * The Python versions of the Lab, as text. They train the Lab's network from
 * scratch: its field, ε, steps and random numbers (mulberry32). Plain Python
 * adds every sum in the Lab's order, so it ends with the Lab's exact weights;
 * NumPy adds them its own way, so after many steps its last digits can
 * differ a little. python.test.ts checks both.
 */
import type { Rewards, Settings, World } from './math';

import { pyNumber } from '../../lib/pycode';

export interface PythonData {
  title: string;
  world: World;
  rewards: Rewards;
  settings: Settings;
  epsilon: number;
  /** How many steps the Lab has trained. */
  steps: number;
}

function head(data: PythonData): string {
  const { world, rewards, settings: s } = data;
  return `# ${data.title}: ${world.columns} × ${world.rows} squares, numbered row by row from the top left
columns, rows = ${world.columns}, ${world.rows}
start, cheese = ${world.start}, ${world.goal}
cats = [${world.cats.join(', ')}]
step_reward, cheese_reward, cat_reward = ${rewards.step}, ${rewards.goal}, ${rewards.cat}
epsilon = ${pyNumber(data.epsilon)}  # the chance of a random move
steps = ${data.steps}  # how far the Lab has trained
hidden, learning_rate, gamma = ${s.hidden}, ${pyNumber(s.learningRate)}, ${pyNumber(s.gamma)}
batch_size, capacity, target_every, max_moves = ${s.batch}, ${s.capacity}, ${s.targetEvery}, ${s.maxEpisodeSteps}

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
    if 0 <= r < rows and 0 <= c < columns:
        cell = r * columns + c  # the edge blocks the move
    if cell == cheese:
        return cell, cheese_reward, True
    if cell in cats:
        return cell, cat_reward, True
    return cell, step_reward, False

def features(cell):
    """What the network sees of a square: its column and row, from 0 to 1."""
    return [(cell % columns) / (columns - 1), (cell // columns) / (rows - 1)]

random = mulberry32(${s.seed})`;
}

/** The training loop, the same for both; only the network code differs. */
const loop = `buffer, episodes = [], []  # the replay memory, and each episode's total reward
position, moves, total, loss = start, 0, 0, None
for t in range(1, steps + 1):
    q = forward(net, features(position))[1]
    action = int(random() * 4) if random() < epsilon else best(q)
    nxt, reward, done = move(position, action)
    buffer.append((position, action, reward, nxt, done))
    if len(buffer) > capacity:
        buffer.pop(0)  # forget the oldest move
    if len(buffer) >= batch_size:
        # Recall a few moves at random; y = r + γ max Q_target(s′, a′) is
        # what Q(s, a) should have been
        batch = []
        for _ in range(batch_size):
            cell, a, r, after, ended = buffer[int(random() * len(buffer))]
            y = r if ended else r + gamma * max(forward(target, features(after))[1])
            batch.append((cell, a, y))
        loss = learn(net, batch)
    if t % target_every == 0:
        target = copy(net)  # the target network catches up
    total += reward
    position, moves = nxt, moves + 1
    if done or moves >= max_moves:
        episodes.append(total)
        position, moves, total = start, 0, 0

print(f"Trained {steps} steps: {len(episodes)} episodes finished, the last ones scoring {episodes[-5:]}")
if loss is not None:
    print(f"Average loss of the last minibatch: L = {loss:.2f}")
q = forward(net, features(start))[1]
print(f"{name(start)}: Q = " + ", ".join(f"{a} {v:.2f}" for a, v in zip(ARROWS, q)))

# The best path: from the start, always take the best move
path, cell, done = [start], start, False
while not done and len(path) <= 30:
    cell, _, done = move(cell, best(forward(net, features(cell))[1]))
    path.append(cell)
if path[-1] == cheese:
    print(f"Best path from the start: {len(path) - 1} steps: " + " → ".join(map(name, path)))
else:
    print("Best path from the start: none yet")`;

/** With NumPy: the network's weights are arrays. */
export function numpyPython(data: PythonData): string {
  return `import numpy as np

${head(data)}

# The network: 2 inputs → ${data.settings.hidden} hidden units (ReLU) → 4 Q-values, small random weights
W1 = np.array([[(random() * 2 - 1) * np.sqrt(1 / 2) for _ in range(2)] for _ in range(hidden)])
W2 = np.array([[(random() * 2 - 1) * np.sqrt(1 / hidden) for _ in range(hidden)] for _ in range(4)])
net = [W1, np.zeros(hidden), W2, np.zeros(4)]

def forward(net, x):
    """h = ReLU(W1 x + b1), q = W2 h + b2: one Q-value per move."""
    W1, b1, W2, b2 = net
    h = np.maximum(W1 @ x + b1, 0)
    return h, W2 @ h + b2

def best(q):
    return int(np.argmax(q))  # the first of the highest

def copy(net):
    return [w.copy() for w in net]

def learn(net, batch):
    """One gradient step on L = average of (Q(s, a) − y)², by backpropagation."""
    W1, b1, W2, b2 = net
    grads = [np.zeros_like(w) for w in net]
    loss = 0
    for cell, a, y in batch:
        x = np.array(features(cell))
        h, q = forward(net, x)
        error = q[a] - y
        loss += error ** 2 / len(batch)
        e = 2 * error / len(batch)
        dh = np.where(h > 0, e * W2[a], 0)  # back through the ReLU
        grads[0] += np.outer(dh, x)
        grads[1] += dh
        grads[2][a] += e * h
        grads[3][a] += e
    for w, g in zip(net, grads):
        w -= learning_rate * g  # step downhill
    return loss

target = copy(net)
# NumPy adds up the products in its own order, so after many steps the last
# digits can differ a little from the Lab's; Plain Python keeps the Lab's order.
${loop}
`;
}

/** Plain Python, no libraries: every sum added in the Lab's order. */
export function plainPython(data: PythonData): string {
  return `from math import sqrt

${head(data)}

# The network: 2 inputs → ${data.settings.hidden} hidden units (ReLU) → 4 Q-values, small random weights
W1 = [[(random() * 2 - 1) * sqrt(1 / 2) for _ in range(2)] for _ in range(hidden)]
W2 = [[(random() * 2 - 1) * sqrt(1 / hidden) for _ in range(hidden)] for _ in range(4)]
net = [W1, [0.0] * hidden, W2, [0.0] * 4]

def forward(net, x):
    """h = ReLU(W1 x + b1), q = W2 h + b2: one Q-value per move."""
    W1, b1, W2, b2 = net
    h = []
    for j in range(len(b1)):
        v = b1[j] + W1[j][0] * x[0] + W1[j][1] * x[1]
        h.append(v if v > 0 else 0.0)  # ReLU: negatives become 0
    q = []
    for a in range(4):
        v = b2[a]
        for j in range(len(h)):  # added one by one, in the Lab's order
            v += W2[a][j] * h[j]
        q.append(v)
    return h, q

def best(q):
    return q.index(max(q))  # the first of the highest

def copy(net):
    return [[row[:] for row in net[0]], net[1][:], [row[:] for row in net[2]], net[3][:]]

def learn(net, batch):
    """One gradient step on L = average of (Q(s, a) − y)², by backpropagation."""
    W1, b1, W2, b2 = net
    g1 = [[0.0, 0.0] for _ in b1]
    gb1, g2, gb2 = [0.0] * len(b1), [[0.0] * len(b1) for _ in range(4)], [0.0] * 4
    loss = 0
    for cell, a, y in batch:
        x = features(cell)
        h, q = forward(net, x)
        error = q[a] - y
        loss += error * error / len(batch)
        e = 2 * error / len(batch)
        for j in range(len(h)):
            g2[a][j] += e * h[j]
        gb2[a] += e
        for j in range(len(h)):
            dh = e * W2[a][j] if h[j] > 0 else 0  # back through the ReLU
            g1[j][0] += dh * x[0]
            g1[j][1] += dh * x[1]
            gb1[j] += dh
    for j in range(len(b1)):  # step downhill
        W1[j][0] -= learning_rate * g1[j][0]
        W1[j][1] -= learning_rate * g1[j][1]
        b1[j] -= learning_rate * gb1[j]
    for a in range(4):
        for j in range(len(b1)):
            W2[a][j] -= learning_rate * g2[a][j]
        b2[a] -= learning_rate * gb2[a]
    return loss

target = copy(net)
${loop}
`;
}
