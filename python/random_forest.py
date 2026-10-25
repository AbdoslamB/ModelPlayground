"""Generate the Random Forest data and its reference results.

The data is made up: 30 seeds in a tray, each kept at a soil temperature
(°C) and given some water (ml a day). Seeds sprout when warmth and water
together are enough, so the border runs on a slant, and a few seeds near it
break the rule. One tree can only draw the border as a staircase; many trees
voting draw a smoother one.

The forest is random (bootstrap samples, one random feature per question).
Its randomness comes from mulberry32 (python/rng.py), the same generator the
page uses, so this script grows exactly the page's forests. Every question a
tree asks is checked against scikit-learn: on the same rows and feature, a
one-question tree must pick the same threshold.

Writes:
- src/models/random-forest/data/seeds.json    the sets, used by the page
- tests/fixtures/random-forest.json           the forests' samples, questions,
                                              votes and out-of-bag scores
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
if (ROOT / ".pydeps").is_dir():
    sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np  # noqa: E402
from rng import mulberry32  # noqa: E402
from sklearn.tree import DecisionTreeClassifier  # noqa: E402

DATA = ROOT / "src" / "models" / "random-forest" / "data" / "seeds.json"
FIXTURES = ROOT / "tests" / "fixtures" / "random-forest.json"

SEED = 3
SETS = 4
SEEDS = 30
AXES = {"x": [5, 30], "y": [0, 40]}
CLASSES = ["dry", "sprout"]  # sorted, as scikit-learn orders them
MAX_DEPTH = 3
MAX_TREES = 25
FOREST_SEED = 1
CHECK_TREES = [1, 5, 25]
INITIAL_TREES = 9
GRID = 21


def make_set(rng: np.random.Generator) -> list[dict]:
    seeds: list[tuple[int, int, str]] = []
    while len(seeds) < SEEDS:
        x = int(rng.integers(AXES["x"][0] + 1, AXES["x"][1]))
        y = int(rng.integers(AXES["y"][0] + 1, AXES["y"][1]))
        if any(abs(x - sx) < 2 and abs(y - sy) < 3 for sx, sy, _ in seeds):
            continue
        # Warmth and water add up: the border is the line (x - 5)/25 + y/40 = 1.
        score = (x - 5) / 25 + y / 40
        sprout = score > 1.0
        if abs(score - 1.0) < 0.15 and rng.random() < 0.3:
            sprout = not sprout
        seeds.append((x, y, "sprout" if sprout else "dry"))
    order = rng.permutation(len(seeds))
    return [{"id": i + 1, "x": seeds[j][0], "y": seeds[j][1], "label": seeds[j][2]} for i, j in enumerate(order)]


def gini(rows: list[dict]) -> float:
    if not rows:
        return 0.0
    return 1.0 - sum((sum(r["label"] == c for r in rows) / len(rows)) ** 2 for c in CLASSES)


def best_threshold(rows: list[dict], feature: str) -> tuple[float, float] | None:
    """The best threshold on one feature: low to high, strictly better wins."""
    values = sorted({r[feature] for r in rows})
    best, best_gain = None, -1.0
    parent = gini(rows)
    for a, b in zip(values, values[1:]):
        t = (a + b) / 2
        left = [r for r in rows if r[feature] <= t]
        right = [r for r in rows if r[feature] > t]
        g = parent - (len(left) * gini(left) + len(right) * gini(right)) / len(rows)
        if g > best_gain + 1e-12:
            best, best_gain = t, g
    return None if best is None else (best, best_gain)


def tree_seed(forest_seed: int, index: int) -> int:
    return forest_seed * 1000 + index


def grow(rows: list[dict], rand, depth: int, path: str, checks: list) -> dict:
    counts = [sum(r["label"] == c for r in rows) for c in CLASSES]
    node: dict = {"path": path, "label": CLASSES[int(np.argmax(counts))]}
    if depth >= MAX_DEPTH or gini(rows) == 0:
        return node
    first = "x" if rand() < 0.5 else "y"
    other = "y" if first == "x" else "x"
    for feature in (first, other):
        found = best_threshold(rows, feature)
        if found:
            break
    if not found:
        return node
    t = found[0]
    checks.append((rows, feature, t))
    node["feature"], node["threshold"] = feature, t
    node["left"] = grow([r for r in rows if r[feature] <= t], rand, depth + 1, path + "L", checks)
    node["right"] = grow([r for r in rows if r[feature] > t], rand, depth + 1, path + "R", checks)
    return node


def make_tree(rows: list[dict], forest_seed: int, index: int, checks: list) -> dict:
    rand = mulberry32(tree_seed(forest_seed, index))
    sample = [int(rand() * len(rows)) for _ in rows]
    tree = grow([rows[i] for i in sample], rand, 0, "", checks)
    return {"sample": sample, "tree": tree}


def predict(node: dict, x: float, y: float) -> str:
    while "feature" in node:
        node = node["left"] if (x if node["feature"] == "x" else y) <= node["threshold"] else node["right"]
    return node["label"]


def vote(trees: list[dict], x: float, y: float) -> str:
    votes = [predict(t["tree"], x, y) for t in trees]
    counts = [votes.count(c) for c in CLASSES]
    return CLASSES[int(np.argmax(counts))]


def out_of_bag(rows: list[dict], trees: list[dict]) -> dict:
    """Each row is judged only by the trees that did not see it."""
    right = judged = 0
    for i, r in enumerate(rows):
        unseen = [t for t in trees if i not in t["sample"]]
        if not unseen:
            continue
        judged += 1
        right += vote(unseen, r["x"], r["y"]) == r["label"]
    return {"right": right, "judged": judged}


def start_point(rows: list[dict], trees: list[dict], size: int) -> dict:
    """Where the new seed starts: a close vote (5 to 4 with 9 trees) in the
    first set, as far as possible from every seed."""
    best, best_gap = None, -1.0
    for x in np.arange(8, 27.01, 0.5):
        for y in np.arange(5, 35.01, 0.5):
            sprouts = sum(predict(t["tree"], x, y) == "sprout" for t in trees[:size])
            if abs(2 * sprouts - size) != 1:
                continue
            gap = min(np.hypot((r["x"] - x) / 25, (r["y"] - y) / 40) for r in rows)
            if gap > best_gap:
                best, best_gap = {"x": float(x), "y": float(y)}, gap
    assert best is not None, "no close vote anywhere"
    print(f"start {best}: {best_gap:.3f} of the chart from the nearest seed")
    return best


def splits(node: dict) -> list[list]:
    if "feature" not in node:
        return []
    return [[node["path"], node["feature"], node["threshold"]], *splits(node["left"]), *splits(node["right"])]


def check_with_sklearn(checks: list) -> None:
    for rows, feature, t in checks:
        features = np.array([[r[feature]] for r in rows], dtype=float)
        labels = np.array([r["label"] for r in rows])
        model = DecisionTreeClassifier(max_depth=1).fit(features, labels)
        assert np.isclose(model.tree_.threshold[0], t, atol=1e-9), (feature, t, model.tree_.threshold[0])


def main() -> None:
    rng = np.random.default_rng(SEED)
    sets = [make_set(rng) for _ in range(SETS)]
    grid = [(float(x), float(y)) for y in np.linspace(*AXES["y"], GRID) for x in np.linspace(*AXES["x"], GRID)]

    fixtures = []
    start = None
    for rows in sets:
        checks: list = []
        trees = [make_tree(rows, FOREST_SEED, i, checks) for i in range(MAX_TREES)]
        check_with_sklearn(checks)
        if start is None:
            start = start_point(rows, trees, INITIAL_TREES)
        fixtures.append(
            {
                "forestSeed": FOREST_SEED,
                "trees": [{"sample": t["sample"], "splits": splits(t["tree"])} for t in trees],
                "forests": {
                    str(n): {
                        "grid": [vote(trees[:n], x, y) for x, y in grid],
                        "outOfBag": out_of_bag(rows, trees[:n]),
                    }
                    for n in CHECK_TREES
                },
                "gridAxes": AXES,
                "gridSize": GRID,
            }
        )
        print(f"{len(checks)} questions agree with scikit-learn; out of bag: "
              + ", ".join(f"T={n}: {f['outOfBag']['right']}/{f['outOfBag']['judged']}" for n, f in fixtures[-1]["forests"].items()))

    dataset = {
        "id": "seeds",
        "title": "Seeds in a tray",
        "question": "Will this seed sprout?",
        "note": (
            "The seeds are made up: they sprout when warmth and water together "
            "are enough, and a few near the border break the rule."
        ),
        "columns": [
            {"key": "x", "label": "Soil temperature", "short": "Temp", "unit": "°C", "role": "x", "decimals": 0},
            {"key": "y", "label": "Water", "short": "Water", "unit": "ml/day", "role": "y", "decimals": 0},
        ],
        "classes": [
            {"id": "dry", "name": "stays dry", "short": "dry", "plural": "dry seeds", "shape": "triangle"},
            {"id": "sprout", "name": "sprouts", "short": "sprout", "plural": "sprouted seeds", "shape": "circle"},
        ],
        "axes": AXES,
        "maxDepth": MAX_DEPTH,
        "trees": {"min": 1, "max": MAX_TREES, "step": 2, "initial": INITIAL_TREES},
        "start": start,
        "batches": sets,
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    FIXTURES.write_text(json.dumps(fixtures, indent=1) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
