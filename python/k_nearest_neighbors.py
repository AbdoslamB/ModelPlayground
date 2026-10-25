"""Generate the k-Nearest Neighbors data and its reference results.

The data is made up: apples are round (width close to height), pears are
taller than they are wide, and a few fruits sit near the border, so the choice
of k matters. Each set has 7 apples and 7 pears, at least 0.35 cm apart so
every fruit stands out on the graph.

Writes:
- src/models/k-nearest-neighbors/data/fruit.json      the sets, used by the page
- tests/fixtures/k-nearest-neighbors.json             scikit-learn predictions
                                                      and leave-one-out scores
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if (ROOT / ".pydeps").is_dir():
    sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np  # noqa: E402
from sklearn.neighbors import KNeighborsClassifier  # noqa: E402

DATA = ROOT / "src" / "models" / "k-nearest-neighbors" / "data" / "fruit.json"
FIXTURES = ROOT / "tests" / "fixtures" / "k-nearest-neighbors.json"

SEED = 11
SETS = 6
PER_CLASS = 7
MIN_GAP = 0.35  # cm between any two fruits
KS = [1, 3, 5, 7, 9]
QUERIES = 25  # random new fruits per set, for the fixtures

# Width and height in cm, mean and spread of each kind of fruit.
KINDS = {
    "apple": {"mean": (7.5, 7.5), "sd": (0.85, 0.75)},
    "pear": {"mean": (6.7, 9.3), "sd": (0.75, 0.95)},
}
AXES = {"x": [4, 11], "y": [5, 12]}


def make_set(rng: np.random.Generator) -> list[dict]:
    fruits: list[tuple[float, float, str]] = []
    for label, kind in KINDS.items():
        placed = 0
        while placed < PER_CLASS:
            x, y = rng.normal(kind["mean"], kind["sd"])
            x, y = round(float(x), 1), round(float(y), 1)
            inside = AXES["x"][0] + 0.4 <= x <= AXES["x"][1] - 0.4 and AXES["y"][0] + 0.4 <= y <= AXES["y"][1] - 0.4
            apart = all(np.hypot(x - fx, y - fy) >= MIN_GAP for fx, fy, _ in fruits)
            if inside and apart:
                fruits.append((x, y, label))
                placed += 1
    order = rng.permutation(len(fruits))
    return [
        {"id": i + 1, "x": fruits[j][0], "y": fruits[j][1], "label": fruits[j][2]}
        for i, j in enumerate(order)
    ]


def ranked(rows: list[dict], qx: float, qy: float, skip: int | None = None) -> list[dict]:
    """Rows by distance to the query; ties broken by id, as the page does."""
    others = [r for r in rows if r["id"] != skip]
    return sorted(others, key=lambda r: (np.hypot(r["x"] - qx, r["y"] - qy), r["id"]))


def vote(neighbours: list[dict]) -> str:
    counts: dict[str, int] = {}
    for r in neighbours:
        counts[r["label"]] = counts.get(r["label"], 0) + 1
    return max(counts, key=lambda label: (counts[label], -neighbours.index(next(r for r in neighbours if r["label"] == label))))


def leave_one_out(rows: list[dict], k: int) -> int:
    """How many fruits are guessed right by their k nearest other fruits."""
    return sum(vote(ranked(rows, r["x"], r["y"], skip=r["id"])[:k]) == r["label"] for r in rows)


def start_point(sets: list[list[dict]]) -> dict:
    """Where the new fruit starts: near the middle of the border between the
    two kinds, where the first set's three nearest fruits disagree, and as far
    as possible from every fruit in every set, so it never sits on one."""
    best, best_gap = (7.0, 8.4), -1.0
    for x in np.arange(6.4, 7.81, 0.1):
        for y in np.arange(7.8, 9.21, 0.1):
            # The first view should show a real vote: with k = 3 in the first
            # set, the neighbours split 2 to 1.
            first = [r["label"] for r in ranked(sets[0], x, y)[:3]]
            if len(set(first)) < 2:
                continue
            gap = min(np.hypot(r["x"] - x, r["y"] - y) for rows in sets for r in rows)
            if gap > best_gap:
                best, best_gap = (round(float(x), 1), round(float(y), 1)), gap
    print(f"start {best}: at least {best_gap:.2f} cm from every fruit in every set")
    return {"x": best[0], "y": best[1]}


def main() -> None:
    rng = np.random.default_rng(SEED)
    sets = [make_set(rng) for _ in range(SETS)]
    start = start_point(sets)

    fixtures = []
    for rows in sets:
        features = np.array([[r["x"], r["y"]] for r in rows])
        labels = np.array([r["label"] for r in rows])
        # Queries off the 0.1 cm grid, so no two fruits are ever equally near.
        queries = rng.uniform([AXES["x"][0], AXES["y"][0]], [AXES["x"][1], AXES["y"][1]], (QUERIES, 2))
        predictions = {}
        for k in KS:
            model = KNeighborsClassifier(n_neighbors=k, algorithm="brute").fit(features, labels)
            sk = model.predict(queries).tolist()
            ours = [vote(ranked(rows, qx, qy)[:k]) for qx, qy in queries]
            assert sk == ours, f"k={k}: our vote disagrees with scikit-learn"
            predictions[str(k)] = sk
        fixtures.append(
            {
                "queries": queries.round(6).tolist(),
                "predictions": predictions,
                "leaveOneOut": {str(k): leave_one_out(rows, k) for k in KS},
            }
        )

    dataset = {
        "id": "fruit",
        "title": "Apples and pears",
        "question": "A new fruit arrives. Is it an apple or a pear?",
        "start": start,
        "note": (
            "The numbers are made up: apples are round, pears are taller than "
            "they are wide, and a few fruits sit near the border."
        ),
        "columns": [
            {"key": "x", "label": "Width", "short": "Width", "unit": "cm", "role": "x", "decimals": 1},
            {"key": "y", "label": "Height", "short": "Height", "unit": "cm", "role": "y", "decimals": 1},
        ],
        "classes": [
            {"id": "apple", "name": "apple", "plural": "apples", "shape": "circle"},
            {"id": "pear", "name": "pear", "plural": "pears", "shape": "triangle"},
        ],
        "axes": AXES,
        "ks": KS,
        "startK": 3,
        "batches": sets,
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8", newline="\n")
    FIXTURES.write_text(json.dumps(fixtures, indent=1) + "\n", encoding="utf-8", newline="\n")
    for i, f in enumerate(fixtures, 1):
        print(f"set {i}: leave-one-out right (of 14) for k = 1..9: {f['leaveOneOut']}")


if __name__ == "__main__":
    main()
