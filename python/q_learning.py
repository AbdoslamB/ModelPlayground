"""Generate the Q-Learning mazes and their reference results.

A mouse learns its way through a small maze to the cheese (+10), avoiding the
cat (−10); every step costs 1. The page trains with Q-learning, exploring with
ε-greedy moves whose randomness comes from mulberry32 (python/rng.py), the
same generator the page uses. This script runs the same training, so the
tests can check the page's Q-table step for step, and it checks the result
against value iteration (the exact answer): after enough episodes, the
mouse's greedy path is a shortest safe path.

Writes:
- src/models/q-learning/data/mazes.json     the mazes and the settings
- tests/fixtures/q-learning.json            Q-tables after set numbers of
                                            steps, and value iteration's Q*
"""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from rng import mulberry32  # noqa: E402

DATA = ROOT / "src" / "models" / "q-learning" / "data" / "mazes.json"
FIXTURES = ROOT / "tests" / "fixtures" / "q-learning.json"

# S start, G cheese (goal), C cat, # wall, . open
MAZES = [
    [
        "...#.G",
        ".#.#..",
        ".#..C.",
        "......",
        "S.#...",
    ],
    [
        "..C..G",
        ".##.#.",
        "......",
        ".#C##.",
        "S.....",
    ],
    [
        ".....G",
        ".###C.",
        ".....#",
        "#.##..",
        "S..C..",
    ],
    [
        "S.#..G",
        ".##.#.",
        "...C..",
        ".#.#.#",
        "......",
    ],
]
# Up, right, down, left: (row step, column step).
MOVES = [(-1, 0), (0, 1), (1, 0), (0, -1)]
STEP_REWARD = -1
GOAL_REWARD = 10
CAT_REWARD = -10
MAX_EPISODE_STEPS = 100
SEED = 7
PARAMS = {"alpha": 0.5, "gamma": 0.9, "epsilon": 0.1}
CHECK_STEPS = [0, 1, 7, 50, 400, 3000]
TRAIN_EPISODES = 200


def parse(rows: list[str]) -> dict:
    columns = len(rows[0])
    cells = "".join(rows)
    return {
        "columns": columns,
        "rows": len(rows),
        "start": cells.index("S"),
        "goal": cells.index("G"),
        "walls": [i for i, c in enumerate(cells) if c == "#"],
        "cats": [i for i, c in enumerate(cells) if c == "C"],
    }


def move(world: dict, s: int, a: int) -> tuple[int, int, bool]:
    """One step: (next cell, reward, episode over). Walls and edges block."""
    row, col = divmod(s, world["columns"])
    dr, dc = MOVES[a]
    r, c = row + dr, col + dc
    nxt = s
    if 0 <= r < world["rows"] and 0 <= c < world["columns"] and r * world["columns"] + c not in world["walls"]:
        nxt = r * world["columns"] + c
    if nxt == world["goal"]:
        return nxt, GOAL_REWARD, True
    if nxt in world["cats"]:
        return nxt, CAT_REWARD, True
    return nxt, STEP_REWARD, False


def choose(q: list[float], epsilon: float, rand) -> int:
    """ε-greedy: explore with chance ε, else the best move (ties at random)."""
    if rand() < epsilon:
        return int(rand() * 4)
    best = max(q)
    ties = [a for a in range(4) if q[a] == best]
    return ties[0] if len(ties) == 1 else ties[int(rand() * len(ties))]


def simulate(world: dict, params: dict, seed: int, steps: int | None = None, episodes: int | None = None) -> dict:
    rand = mulberry32(seed)
    n = world["columns"] * world["rows"]
    Q = [[0.0] * 4 for _ in range(n)]
    s, t, done_steps, episode, in_episode = world["start"], 0, 0, 0, 0
    while True:
        if steps is not None and t >= steps:
            break
        if episodes is not None and episode >= episodes:
            break
        a = choose(Q[s], params["epsilon"], rand)
        nxt, r, done = move(world, s, a)
        target = r if done else r + params["gamma"] * max(Q[nxt])
        Q[s][a] += params["alpha"] * (target - Q[s][a])
        t += 1
        in_episode += 1
        s = nxt
        if done or in_episode >= MAX_EPISODE_STEPS:
            episode += 1
            in_episode = 0
            s = world["start"]
            done_steps = t
    return {"Q": Q, "steps": t, "episode": episode, "position": s, "episodeEnd": done_steps}


def value_iteration(world: dict, gamma: float) -> list[list[float]]:
    n = world["columns"] * world["rows"]
    Q = [[0.0] * 4 for _ in range(n)]
    for _ in range(1000):
        delta = 0.0
        for s in range(n):
            if s in world["walls"] or s == world["goal"] or s in world["cats"]:
                continue
            for a in range(4):
                nxt, r, done = move(world, s, a)
                value = r if done else r + gamma * max(Q[nxt])
                delta = max(delta, abs(value - Q[s][a]))
                Q[s][a] = value
        if delta < 1e-12:
            break
    return Q


def greedy_path(world: dict, Q: list[list[float]], limit: int = 40) -> list[int] | None:
    s, path = world["start"], [world["start"]]
    for _ in range(limit):
        a = Q[s].index(max(Q[s]))
        s, _, done = move(world, s, a)
        path.append(s)
        if done:
            return path if s == world["goal"] else None
    return None


def shortest(world: dict) -> int:
    """Fewest steps from the start to the cheese, never through a cat."""
    seen, queue = {world["start"]: 0}, deque([world["start"]])
    while queue:
        s = queue.popleft()
        for a in range(4):
            nxt, _, done = move(world, s, a)
            if nxt in seen or nxt in world["cats"]:
                continue
            seen[nxt] = seen[s] + 1
            if nxt == world["goal"]:
                return seen[nxt]
            queue.append(nxt)
    raise ValueError("no safe path")


def main() -> None:
    worlds = [parse(rows) for rows in MAZES]
    fixtures = []
    for i, world in enumerate(worlds, 1):
        best = shortest(world)
        star = value_iteration(world, PARAMS["gamma"])
        assert len(greedy_path(world, star)) - 1 == best, "value iteration should find a shortest path"
        trained = simulate(world, PARAMS, SEED, episodes=TRAIN_EPISODES)
        path = greedy_path(world, trained["Q"])
        assert path is not None and len(path) - 1 == best, f"maze {i}: training did not find a shortest path"
        fixtures.append(
            {
                "shortest": best,
                "valueIteration": [[round(v, 9) for v in q] for q in star],
                "afterSteps": {
                    str(n): {k: v for k, v in simulate(world, PARAMS, SEED, steps=n).items()} for n in CHECK_STEPS
                },
                "afterEpisodes": {"episodes": TRAIN_EPISODES, "steps": trained["steps"], "path": path},
            }
        )
        print(f"maze {i}: shortest path {best} steps; {TRAIN_EPISODES} episodes = {trained['steps']} steps")

    dataset = {
        "id": "mazes",
        "title": "A mouse in a maze",
        "question": "Which way should the mouse go from each square?",
        "note": "The mazes are made up: the cheese is worth +10, the cat −10, and every step costs 1.",
        "mazes": worlds,
        "rewards": {"step": STEP_REWARD, "goal": GOAL_REWARD, "cat": CAT_REWARD},
        "maxEpisodeSteps": MAX_EPISODE_STEPS,
        "seed": SEED,
        "episodes": {"min": 0, "max": TRAIN_EPISODES, "step": 1, "initial": 15},
        "alpha": {"min": 0.05, "max": 1, "step": 0.05, "initial": PARAMS["alpha"]},
        "gamma": {"min": 0.5, "max": 0.99, "step": 0.01, "initial": PARAMS["gamma"]},
        "epsilon": {"min": 0, "max": 0.5, "step": 0.05, "initial": PARAMS["epsilon"]},
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    FIXTURES.write_text(json.dumps(fixtures, indent=1) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
