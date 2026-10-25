"""Generate the Decision Tree data and its reference results.

The data is made up: 20 days at the seaside, each with its temperature (°C)
and wind (km/h), marked as a good beach day or not. Good days are warm and
not too windy, and a few days near the border break the rule, so a deep tree
starts chasing exceptions.

Writes:
- src/models/decision-tree/data/beach.json    the sets, used by the page
- tests/fixtures/decision-tree.json           scikit-learn's splits and
                                              predictions for depths 1 to 4
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if (ROOT / ".pydeps").is_dir():
    sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np  # noqa: E402
from sklearn.tree import DecisionTreeClassifier  # noqa: E402

DATA = ROOT / "src" / "models" / "decision-tree" / "data" / "beach.json"
FIXTURES = ROOT / "tests" / "fixtures" / "decision-tree.json"

SEED = 5
SETS = 6
DAYS = 20
DEPTHS = [1, 2, 3, 4]
AXES = {"x": [10, 36], "y": [0, 40]}
CLASSES = ["go", "stay"]  # sorted, as scikit-learn orders them
WARM = 22  # °C: a good day is at least this warm …
CALM = 20  # km/h: … and at most this windy
GRID = 26  # grid points per axis, for comparing predictions


def make_set(rng: np.random.Generator) -> list[dict]:
    days: list[tuple[int, int, str]] = []
    while len(days) < DAYS:
        x = int(rng.integers(AXES["x"][0] + 1, AXES["x"][1]))
        y = int(rng.integers(AXES["y"][0] + 2, AXES["y"][1] - 1))
        # Keep days apart (in steps of the axes), so every one is visible.
        if any(abs(x - dx) < 2 and abs(y - dy) < 3 for dx, dy, _ in days):
            continue
        good = x >= WARM and y <= CALM
        near = abs(x - WARM) <= 3 or abs(y - CALM) <= 4
        if near and rng.random() < 0.3:
            good = not good
        days.append((x, y, "go" if good else "stay"))
    order = rng.permutation(len(days))
    return [{"id": i + 1, "x": days[j][0], "y": days[j][1], "label": days[j][2]} for i, j in enumerate(order)]


def gini(rows: list[dict]) -> float:
    if not rows:
        return 0.0
    return 1.0 - sum((sum(r["label"] == c for r in rows) / len(rows)) ** 2 for c in CLASSES)


def best_split(rows: list[dict]) -> tuple[str, float] | None:
    """As the page does it: features in order x then y, thresholds low to
    high, keeping only a strictly better gain."""
    best, best_gain = None, -1.0
    parent = gini(rows)
    for feature in ("x", "y"):
        values = sorted({r[feature] for r in rows})
        for a, b in zip(values, values[1:]):
            t = (a + b) / 2
            left = [r for r in rows if r[feature] <= t]
            right = [r for r in rows if r[feature] > t]
            g = parent - (len(left) * gini(left) + len(right) * gini(right)) / len(rows)
            if g > best_gain + 1e-12:
                best, best_gain = (feature, t), g
    return best


def grow(rows: list[dict], depth: int, max_depth: int, path: str = "") -> dict:
    node: dict = {"path": path, "n": len(rows)}
    split = best_split(rows) if depth < max_depth and gini(rows) > 0 else None
    if split is None:
        counts = [sum(r["label"] == c for r in rows) for c in CLASSES]
        node["label"] = CLASSES[int(np.argmax(counts))]
        return node
    feature, t = split
    node["feature"], node["threshold"] = feature, t
    node["left"] = grow([r for r in rows if r[feature] <= t], depth + 1, max_depth, path + "L")
    node["right"] = grow([r for r in rows if r[feature] > t], depth + 1, max_depth, path + "R")
    return node


def predict(node: dict, x: float, y: float) -> str:
    while "feature" in node:
        node = node["left"] if (x if node["feature"] == "x" else y) <= node["threshold"] else node["right"]
    return node["label"]


def splits(node: dict) -> list[list]:
    if "feature" not in node:
        return []
    return [[node["path"], node["feature"], node["threshold"]], *splits(node["left"]), *splits(node["right"])]


def sklearn_splits(model: DecisionTreeClassifier) -> list[list]:
    tree = model.tree_
    out: list[list] = []

    def walk(i: int, path: str) -> None:
        if tree.children_left[i] == -1:
            return
        out.append([path, "xy"[tree.feature[i]], float(tree.threshold[i])])
        walk(tree.children_left[i], path + "L")
        walk(tree.children_right[i], path + "R")

    walk(0, "")
    return out


def check(rows: list[dict]) -> dict | None:
    """Our trees and scikit-learn's for every depth, or None if they differ
    (scikit-learn breaks exact ties between splits at random)."""
    features = np.array([[r["x"], r["y"]] for r in rows], dtype=float)
    labels = np.array([r["label"] for r in rows])
    grid = [(float(x), float(y)) for y in np.linspace(*AXES["y"], GRID) for x in np.linspace(*AXES["x"], GRID)]
    per_depth = {}
    for depth in DEPTHS:
        ours = grow(rows, 0, depth)
        model = DecisionTreeClassifier(max_depth=depth, random_state=0).fit(features, labels)
        theirs = sklearn_splits(model)
        if [[p, f] for p, f, _ in splits(ours)] != [[p, f] for p, f, _ in theirs]:
            return None
        if not np.allclose([t for *_, t in splits(ours)], [t for *_, t in theirs], atol=1e-9):
            return None
        predictions = model.predict(np.array(grid)).tolist()
        if predictions != [predict(ours, x, y) for x, y in grid]:
            return None
        per_depth[str(depth)] = {
            "splits": theirs,
            "trainingRight": int((model.predict(features) == labels).sum()),
            "grid": predictions,
        }
    return per_depth


def main() -> None:
    rng = np.random.default_rng(SEED)
    sets, fixtures = [], []
    while len(sets) < SETS:
        rows = make_set(rng)
        good = sum(r["label"] == "go" for r in rows)
        result = check(rows) if 7 <= good <= 12 else None
        # The first view (depth 2) should find the rule: warm, then calm.
        if result and [s[1] for s in result["2"]["splits"]][:2] == ["x", "y"]:
            sets.append(rows)
            fixtures.append({**result, "gridAxes": AXES, "gridSize": GRID})

    dataset = {
        "id": "beach",
        "title": "Beach days",
        "question": "Is it a good day for the beach?",
        "note": (
            "The days are made up: good beach days are warm and not too "
            "windy, and a few days near the border break the rule."
        ),
        "columns": [
            {"key": "x", "label": "Temperature", "short": "Temp", "unit": "°C", "role": "x", "decimals": 0},
            {"key": "y", "label": "Wind", "short": "Wind", "unit": "km/h", "role": "y", "decimals": 0},
        ],
        "classes": [
            {"id": "go", "name": "beach day", "short": "beach", "plural": "beach days", "shape": "circle"},
            {"id": "stay", "name": "stay home", "short": "stay", "plural": "stay-home days", "shape": "triangle"},
        ],
        "axes": AXES,
        "depths": {"min": DEPTHS[0], "max": DEPTHS[-1], "step": 1, "initial": 2},
        "batches": sets,
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    FIXTURES.write_text(json.dumps(fixtures, indent=1) + "\n", encoding="utf-8", newline="\n")
    for i, f in enumerate(fixtures, 1):
        right = ", ".join(f"depth {d}: {f[str(d)]['trainingRight']}" for d in DEPTHS)
        print(f"set {i}: right on its own data (of {DAYS}) for {right}")


if __name__ == "__main__":
    main()
