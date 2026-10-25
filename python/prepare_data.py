"""Generate the Linear Regression datasets.

The numbers are made up, but they follow the pattern of real measurements,
so learners get the feel of real data without any copyrighted dataset. Each
dataset has several batches of 10 well-spread points; the page's "New data"
button moves to the next batch.

Writes src/models/linear-regression/data/<id>.json (rows + metadata).
Run make_fixtures.py afterwards: it adds the reference results.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Lets an embedded Python (which ignores PYTHONPATH) use libraries installed
# with `pip install --target .pydeps -r python/requirements.txt`.
if (ROOT / ".pydeps").is_dir():
    sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np  # noqa: E402

DATA_OUT = ROOT / "src" / "models" / "linear-regression" / "data"

SEED = 7
BATCHES = 6
PER_BATCH = 10


def spread(rng: np.random.Generator, low: float, high: float) -> np.ndarray:
    """One x in the middle half of each tenth of [low, high]. Neighbors are then
    at least half a tenth apart, so the points never bunch up or share an x,
    even after rounding."""
    edges = np.linspace(low, high, PER_BATCH + 1)
    width = edges[1] - edges[0]
    return rng.uniform(edges[:-1] + width / 4, edges[1:] - width / 4)


def batches(rng: np.random.Generator, make_batch) -> list[list[dict]]:
    result = []
    for _ in range(BATCHES):
        x, y = make_batch()
        order = rng.permutation(PER_BATCH)  # table order is not sorted by x
        result.append(
            [{"id": i + 1, "x": float(x[j]), "y": float(y[j])} for i, j in enumerate(order)]
        )
    return result


def plants(rng: np.random.Generator) -> dict:
    # Each set is one plant measured as it grows: height = a + b × age, with
    # a (height at week 0) and b (growth per week) whole numbers from 1 to 10,
    # plus a little measuring noise that grows with the plant's growth rate.
    truths = []

    def make_batch():
        a = int(rng.integers(1, 11))
        b = int(rng.integers(1, 11))
        truths.append({"a": a, "b": b})
        x = np.round(spread(rng, 0, 10), 1)
        noise = rng.normal(0, 1 + 0.4 * b, PER_BATCH)
        y = np.round(np.maximum(0, a + b * x + noise))
        return x, y

    dataset = {
        "id": "plants",
        "title": "Plant growth",
        "question": "A plant is 4 weeks old. How tall is it?",
        "exampleX": 4,
        "rowMeaning": "One measurement of a plant: its age and its height.",
        "note": (
            "The numbers are made up: each set is one plant that starts between "
            "1 and 10 cm tall and grows between 1 and 10 cm a week."
        ),
        "columns": [
            {"key": "x", "label": "Age of the plant", "short": "Age", "unit": "weeks", "role": "x", "decimals": 1},
            {"key": "y", "label": "Height", "short": "Height", "unit": "cm", "role": "y", "decimals": 0},
        ],
        "words": {
            "row": "measurement",
            "rows": "measurements",
            "x": "age",
            "y": "height",
            "xStep": "week",
        },
        "axes": {"x": [0, 10], "y": [0, 120]},
        "params": {
            "a": {"min": -10, "max": 100, "step": 0.5},
            "b": {"min": -5, "max": 15, "step": 0.1},
        },
        "thresholds": {"typicalMiss": 5},
        "batches": batches(rng, make_batch),
    }
    dataset["truths"] = truths
    return dataset


def braking(rng: np.random.Generator) -> dict:
    # Stopping distance grows faster than speed (a curve), so a straight
    # line misses in a pattern and predicts a negative distance at 0 mph.
    def make_batch():
        x = np.round(spread(rng, 4, 25))
        y = np.round(np.maximum(2, 0.1 * x**2 + 1.2 * x + rng.normal(0, 8, PER_BATCH)))
        return x, y

    return {
        "id": "braking",
        "title": "Stopping distance",
        "question": "A car is going 20 mph. How far does it need to stop?",
        "exampleX": 20,
        "rowMeaning": "One car braking test.",
        "note": (
            "The numbers are made up, but they follow the pattern of real "
            "braking tests: faster cars need much longer to stop."
        ),
        "columns": [
            {"key": "x", "label": "Speed", "short": "Speed", "unit": "mph", "role": "x", "decimals": 0},
            {"key": "y", "label": "Stopping distance", "short": "Distance", "unit": "ft", "role": "y", "decimals": 0},
        ],
        "words": {
            "row": "braking test",
            "rows": "braking tests",
            "x": "speed",
            "y": "stopping distance",
            "xStep": "mph of speed",
        },
        "axes": {"x": [0, 26], "y": [-40, 130]},
        "params": {
            "a": {"min": -60, "max": 80, "step": 0.5},
            "b": {"min": -4, "max": 10, "step": 0.05},
        },
        "thresholds": {"typicalMiss": 16},
        "batches": batches(rng, make_batch),
    }


def write(dataset: dict) -> None:
    ys = [row["y"] for batch in dataset["batches"] for row in batch]
    # Starting line: a flat line at the average y, which ignores x.
    dataset["params"]["a"]["initial"] = float(round(sum(ys) / len(ys)))
    dataset["params"]["b"]["initial"] = 0.0
    path = DATA_OUT / f"{dataset['id']}.json"
    path.write_text(
        json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"{dataset['id']}: {len(dataset['batches'])} batches of {PER_BATCH}")


def main() -> None:
    DATA_OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(SEED)
    for build in (plants, braking):
        write(build(rng))


if __name__ == "__main__":
    main()
