"""Generate the Deep Q-Network worlds and their reference results.

A mouse learns to reach the cheese (+10) in a small field, avoiding cats
(−10); every step costs 1. Unlike Q-Learning, there is no table: a small
neural network (2 inputs: the square's column and row; 24 hidden units with
ReLU; 4 outputs, one Q-value per move) estimates every square's values, so
what it learns in one square carries over to the squares around it.

Training is standard DQN: ε-greedy moves, a replay buffer of the last 400
moves, minibatches of 8 drawn from it, a target network copied every 100
steps, and plain gradient descent on the squared error. All randomness comes
from mulberry32 (python/rng.py), and this script does every sum in the same
order as the page, in plain Python, so the page must match it exactly. The
script also checks that the trained network's greedy path is a shortest
safe path.

Writes:
- src/models/deep-q-network/data/fields.json   the worlds and the settings
- tests/fixtures/deep-q-network.json           weights, Q-values and episodes
                                                after set numbers of steps
"""

from __future__ import annotations

import json
import math
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from rng import mulberry32  # noqa: E402

DATA = ROOT / "src" / "models" / "deep-q-network" / "data" / "fields.json"
FIXTURES = ROOT / "tests" / "fixtures" / "deep-q-network.json"

# S start, G cheese, C cat, . open
WORLDS = [
    ["....G", ".....", "..C..", ".....", "S...."],
    ["....G", ".C...", "...C.", ".....", "S...."],
    ["....G", "..C..", ".....", ".C...", "S...."],
]
MOVES = [(-1, 0), (0, 1), (1, 0), (0, -1)]
REWARDS = {"step": -1, "goal": 10, "cat": -10}
SETTINGS = {
    "hidden": 24,
    "learningRate": 0.05,
    "batch": 8,
    "capacity": 400,
    "targetEvery": 100,
    "gamma": 0.9,
    "maxEpisodeSteps": 50,
    "seed": 1,
}
STEPS = 3000
SNAPSHOTS = [1, 10, 100, 1000, STEPS]


def parse(rows: list[str]) -> dict:
    cells = "".join(rows)
    return {
        "columns": len(rows[0]),
        "rows": len(rows),
        "start": cells.index("S"),
        "goal": cells.index("G"),
        "cats": [i for i, c in enumerate(cells) if c == "C"],
    }


def move(w: dict, s: int, a: int) -> tuple[int, int, bool]:
    r, c = divmod(s, w["columns"])
    dr, dc = MOVES[a]
    R, C = r + dr, c + dc
    n = R * w["columns"] + C if 0 <= R < w["rows"] and 0 <= C < w["columns"] else s
    if n == w["goal"]:
        return n, REWARDS["goal"], True
    if n in w["cats"]:
        return n, REWARDS["cat"], True
    return n, REWARDS["step"], False


def features(w: dict, s: int) -> list[float]:
    r, c = divmod(s, w["columns"])
    return [c / (w["columns"] - 1), r / (w["rows"] - 1)]


def forward(net: dict, x: list[float]) -> tuple[list[float], list[float]]:
    """h = ReLU(W1 x + b1), q = W2 h + b2, each sum from the bias, in index order."""
    h = []
    for j in range(len(net["b1"])):
        v = net["b1"][j]
        for k in range(len(x)):
            v += net["W1"][j][k] * x[k]
        h.append(v if v > 0 else 0.0)
    q = []
    for a in range(4):
        v = net["b2"][a]
        for j in range(len(h)):
            v += net["W2"][a][j] * h[j]
        q.append(v)
    return h, q


def argmax(q: list[float]) -> int:
    best = 0
    for a in range(1, len(q)):
        if q[a] > q[best]:
            best = a
    return best


def copy(net: dict) -> dict:
    return {
        "W1": [row[:] for row in net["W1"]],
        "b1": net["b1"][:],
        "W2": [row[:] for row in net["W2"]],
        "b2": net["b2"][:],
    }


def init(H: int, rand) -> dict:
    W1 = [[(rand() * 2 - 1) * math.sqrt(1 / 2) for _ in range(2)] for _ in range(H)]
    W2 = [[(rand() * 2 - 1) * math.sqrt(1 / H) for _ in range(H)] for _ in range(4)]
    return {"W1": W1, "b1": [0.0] * H, "W2": W2, "b2": [0.0] * 4}


def train(w: dict, epsilon: float, steps: int, snapshots: list[int]) -> dict:
    S = SETTINGS
    rand = mulberry32(S["seed"])
    net = init(S["hidden"], rand)
    target = copy(net)
    buffer: list[tuple[int, int, int, int, bool]] = []
    s, in_episode, total, episodes = w["start"], 0, 0, []
    out = {}
    for t in range(1, steps + 1):
        _, q = forward(net, features(w, s))
        a = int(rand() * 4) if rand() < epsilon else argmax(q)
        n, r, done = move(w, s, a)
        buffer.append((s, a, r, n, done))
        if len(buffer) > S["capacity"]:
            buffer.pop(0)
        if len(buffer) >= S["batch"]:
            H = S["hidden"]
            g = {"W1": [[0.0, 0.0] for _ in range(H)], "b1": [0.0] * H, "W2": [[0.0] * H for _ in range(4)], "b2": [0.0] * 4}
            for _ in range(S["batch"]):
                bs, ba, br, bn, bd = buffer[int(rand() * len(buffer))]
                y = br if bd else br + S["gamma"] * max(forward(target, features(w, bn))[1])
                x = features(w, bs)
                h, bq = forward(net, x)
                e = 2 * (bq[ba] - y) / S["batch"]
                for j in range(H):
                    g["W2"][ba][j] += e * h[j]
                g["b2"][ba] += e
                for j in range(H):
                    dh = e * net["W2"][ba][j] if h[j] > 0 else 0.0
                    for k in range(2):
                        g["W1"][j][k] += dh * x[k]
                    g["b1"][j] += dh
            lr = S["learningRate"]
            for j in range(H):
                for k in range(2):
                    net["W1"][j][k] -= lr * g["W1"][j][k]
                net["b1"][j] -= lr * g["b1"][j]
            for a2 in range(4):
                for j in range(H):
                    net["W2"][a2][j] -= lr * g["W2"][a2][j]
                net["b2"][a2] -= lr * g["b2"][a2]
        if t % S["targetEvery"] == 0:
            target = copy(net)
        total += r
        s = n
        in_episode += 1
        if done or in_episode >= S["maxEpisodeSteps"]:
            episodes.append(total)
            s, in_episode, total = w["start"], 0, 0
        if t in snapshots:
            out[str(t)] = {
                "net": copy(net),
                "Q": [forward(net, features(w, c))[1] for c in range(w["columns"] * w["rows"])],
                "episodes": episodes[:],
                "position": s,
            }
    return out


def greedy_path(w: dict, Q: list[list[float]], limit: int = 30) -> list[int] | None:
    s, path = w["start"], [w["start"]]
    for _ in range(limit):
        s, _, done = move(w, s, argmax(Q[s]))
        path.append(s)
        if done:
            return path if s == w["goal"] else None
    return None


def shortest(w: dict) -> int:
    seen, queue = {w["start"]: 0}, deque([w["start"]])
    while queue:
        s = queue.popleft()
        for a in range(4):
            n, _, _ = move(w, s, a)
            if n in seen or n in w["cats"]:
                continue
            seen[n] = seen[s] + 1
            if n == w["goal"]:
                return seen[n]
            queue.append(n)
    raise ValueError("no safe path")


def main() -> None:
    worlds = [parse(rows) for rows in WORLDS]
    epsilon = 0.2
    fixtures = []
    for i, w in enumerate(worlds, 1):
        snaps = train(w, epsilon, STEPS, SNAPSHOTS)
        best = shortest(w)
        path = greedy_path(w, snaps[str(STEPS)]["Q"])
        assert path is not None and len(path) - 1 == best, f"world {i}: no shortest path after training"
        fixtures.append({"epsilon": epsilon, "snapshots": snaps, "shortest": best, "path": path})
        print(f"world {i}: shortest path {best}; {len(snaps[str(STEPS)]['episodes'])} episodes in {STEPS} steps")

    dataset = {
        "id": "fields",
        "title": "A mouse in a field",
        "question": "Which way should the mouse go from each square?",
        "note": "The fields are made up: the cheese is worth +10, a cat −10, and every step costs 1.",
        "worlds": worlds,
        "rewards": REWARDS,
        "settings": SETTINGS,
        "steps": {"min": 0, "max": STEPS, "step": 50, "initial": STEPS},
        "epsilon": {"min": 0.05, "max": 0.5, "step": 0.05, "initial": epsilon},
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    FIXTURES.write_text(json.dumps(fixtures, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
