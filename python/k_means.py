"""Generate the k-Means data and its reference results.

The data is made up: people in a 100 × 100 m park, gathered in three groups
(a picnic lawn, a playground, a café), 8 people each, at least 3 m apart.
The page places k ice-cream stands; k-Means moves each stand to the middle
of the people who walk to it.

Writes:
- src/models/k-means/data/park.json      the sets and the starting stands
- tests/fixtures/k-means.json            scikit-learn results from the same
                                         starting stands, for k = 2, 3, 4
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if (ROOT / ".pydeps").is_dir():
    sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np  # noqa: E402
from sklearn.cluster import KMeans  # noqa: E402

DATA = ROOT / "src" / "models" / "k-means" / "data" / "park.json"
FIXTURES = ROOT / "tests" / "fixtures" / "k-means.json"

SEED = 21
SETS = 6
GROUPS = 3
PER_GROUP = 8
MIN_GAP = 3.0  # metres between any two people
KS = [2, 3, 4]
# Where the stands start: close together near the middle of the park, each
# facing a different way, so the learner sees them spread out to the groups.
STARTS = [(42.0, 44.0), (58.0, 56.0), (56.0, 40.0), (44.0, 60.0)]


def make_set(rng: np.random.Generator) -> list[dict]:
    """A set where, for every k, each stand keeps at least one person, and
    where three stands find the three groups (the best answer) from the
    usual start. Learners can still drag stands into a poor start."""
    while True:
        rows = make_people(rng)
        points = np.array([[r["x"], r["y"]] for r in rows])
        runs = {k: lloyd(points, np.array(STARTS[:k])) for k in KS}
        if any(run is None for run in runs.values()):
            continue
        best = KMeans(n_clusters=GROUPS, n_init=20, random_state=0).fit(points).inertia_
        if runs[GROUPS]["inertia"] <= best * 1.001:
            return rows


def make_people(rng: np.random.Generator) -> list[dict]:
    # Group centres far enough apart that the groups are easy to see.
    while True:
        centres = rng.uniform(22, 78, (GROUPS, 2))
        gaps = [np.hypot(*(centres[i] - centres[j])) for i in range(GROUPS) for j in range(i)]
        if min(gaps) > 32:
            break
    people: list[tuple[float, float]] = []
    for centre in centres:
        placed = 0
        while placed < PER_GROUP:
            x, y = rng.normal(centre, 8.5)
            x, y = round(float(x), 1), round(float(y), 1)
            inside = 4 <= x <= 96 and 4 <= y <= 96
            apart = all(np.hypot(x - px, y - py) >= MIN_GAP for px, py in people)
            if inside and apart:
                people.append((x, y))
                placed += 1
    order = rng.permutation(len(people))
    return [{"id": i + 1, "x": people[j][0], "y": people[j][1]} for i, j in enumerate(order)]


def lloyd(points: np.ndarray, starts: np.ndarray, max_steps: int = 100) -> dict | None:
    """k-Means as the page runs it: assign each point to the nearest stand
    (lowest index on a tie), move each stand to the mean of its points, and
    repeat until nothing moves. None if a stand loses all its people."""
    centres = starts.copy()
    steps = 0
    for _ in range(max_steps):
        distances = ((points[:, None, :] - centres[None, :, :]) ** 2).sum(axis=2)
        labels = distances.argmin(axis=1)
        if not all((labels == j).any() for j in range(len(centres))):
            return None
        moved = np.array([points[labels == j].mean(axis=0) for j in range(len(centres))])
        if np.allclose(moved, centres, atol=1e-12):
            break
        centres = moved
        steps += 1
    distances = ((points[:, None, :] - centres[None, :, :]) ** 2).sum(axis=2)
    labels = distances.argmin(axis=1)
    inertia = float(distances[np.arange(len(points)), labels].sum())
    return {"centres": centres, "labels": labels, "steps": steps, "inertia": inertia}


def main() -> None:
    rng = np.random.default_rng(SEED)
    sets = [make_set(rng) for _ in range(SETS)]

    fixtures = []
    for rows in sets:
        points = np.array([[r["x"], r["y"]] for r in rows])
        per_k = {}
        for k in KS:
            starts = np.array(STARTS[:k])
            ours = lloyd(points, starts)
            assert ours is not None, f"k={k}: a stand lost all its people"
            model = KMeans(n_clusters=k, init=starts, n_init=1, algorithm="lloyd", max_iter=300, tol=0).fit(points)
            assert np.allclose(model.cluster_centers_, ours["centres"], atol=1e-9), f"k={k}: centres differ"
            assert (model.labels_ == ours["labels"]).all(), f"k={k}: groups differ"
            per_k[str(k)] = {
                "centres": model.cluster_centers_.round(9).tolist(),
                "labels": model.labels_.tolist(),
                "inertia": float(model.inertia_),
                "steps": ours["steps"],
            }
        fixtures.append(per_k)

    dataset = {
        "id": "park",
        "title": "People in a park",
        "question": "Where should the ice-cream stands go, so nobody walks far?",
        "note": (
            "The numbers are made up: people gather in three groups, like a "
            "picnic lawn, a playground and a café."
        ),
        "columns": [
            {"key": "x", "label": "East", "short": "East", "unit": "m", "role": "x", "decimals": 1},
            {"key": "y", "label": "North", "short": "North", "unit": "m", "role": "y", "decimals": 1},
        ],
        "axes": {"x": [0, 100], "y": [0, 100]},
        "ks": KS,
        "startK": 3,
        "starts": [{"x": x, "y": y} for x, y in STARTS],
        "batches": sets,
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8", newline="\n")
    FIXTURES.write_text(json.dumps(fixtures, indent=1) + "\n", encoding="utf-8", newline="\n")
    for i, f in enumerate(fixtures, 1):
        summary = ", ".join(f"k={k}: {v['steps']} steps" for k, v in f.items())
        print(f"set {i}: {summary}")


if __name__ == "__main__":
    main()
