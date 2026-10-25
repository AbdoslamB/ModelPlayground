"""Generate the t-SNE pictures and their reference results.

The data is made up: 40 tiny 8 × 8 pictures (pixel values 0 to 16), ten each
of four kinds of shape (a bar across, a bar down, a slash, a backslash), near the
middle but shifted a little, and with a few pixels flipped. t-SNE sees only the 64 pixel
values, yet places pictures of the same kind together on its 2D map.

The page runs exact t-SNE as scikit-learn does it. This script checks each
piece against scikit-learn's own code:
- the perplexity search and joint P (scikit-learn searches in single
  precision, so ours, in double precision, agree to about 1e-6);
- the KL cost and its gradient (_kl_divergence);
- the whole optimisation, by running scikit-learn's _gradient_descent on our
  P from the start positions stored in the data file.

Writes:
- src/models/t-sne/data/pictures.json    the sets and their start positions
- tests/fixtures/t-sne.json              P, KL and gradients, and the maps
                                         after set numbers of steps
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if (ROOT / ".pydeps").is_dir():
    sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np  # noqa: E402
from scipy.spatial.distance import squareform  # noqa: E402
from sklearn.manifold import _t_sne  # noqa: E402

DATA = ROOT / "src" / "models" / "t-sne" / "data" / "pictures.json"
FIXTURES = ROOT / "tests" / "fixtures" / "t-sne.json"

SEED = 4
SETS = 3
PER_KIND = 10
SIZE = 8
KINDS = ["across", "down", "slash", "backslash"]
PERPLEXITIES = [3, 8, 15]
# The optimisation, as scikit-learn's TSNE runs it for 40 points.
EXAGGERATION = 12.0
EXAGGERATED_STEPS = 250
TOTAL_STEPS = 1000
# scikit-learn's "auto" rate is max(n / 12 / 4, 50) = 50 for 40 points. That
# floor suits thousands of points; with 40 it makes the first steps explode
# (the map grows 10,000-fold in three steps), so the result swings with
# rounding noise. At 5 the run is calm, and every set ends well.
LEARNING_RATE = 5.0
# Maps match exactly for the first 50 steps; after that, rounding noise grows
# (fastest at low perplexity), so finished maps are compared by quality.
CHECK_STEPS = [1, 10, 50]


def picture(kind: str, rng: np.random.Generator) -> list[int]:
    img = np.zeros((SIZE, SIZE), dtype=int)
    ink = lambda: int(rng.integers(11, 17))  # noqa: E731
    if kind == "across":
        r, c0 = int(rng.integers(3, 5)), int(rng.integers(0, 2))
        for c in range(c0, c0 + 6 + int(rng.integers(0, 2))):
            img[r, c] = ink()
            img[r + 1, c] = ink()
    elif kind == "down":
        c, r0 = int(rng.integers(3, 5)), int(rng.integers(0, 2))
        for r in range(r0, r0 + 6 + int(rng.integers(0, 2))):
            img[r, c] = ink()
            img[r, c + 1] = ink()
    elif kind == "slash":
        shift = int(rng.integers(-1, 2))
        for r in range(SIZE):
            c = SIZE - 1 - r + shift
            if 0 <= c < SIZE:
                img[r, c] = ink()
            if 0 <= c - 1 < SIZE:
                img[r, c - 1] = ink() // 2
    else:
        shift = int(rng.integers(-1, 2))
        for r in range(SIZE):
            c = r + shift
            if 0 <= c < SIZE:
                img[r, c] = ink()
            if 0 <= c + 1 < SIZE:
                img[r, c + 1] = ink() // 2
    # A few pixels flipped, like smudges.
    for _ in range(int(rng.integers(1, 4))):
        r, c = int(rng.integers(0, SIZE)), int(rng.integers(0, SIZE))
        img[r, c] = 0 if img[r, c] else int(rng.integers(4, 10))
    return img.ravel().tolist()


def make_set(rng: np.random.Generator) -> list[dict]:
    pictures = [(kind, picture(kind, rng)) for kind in KINDS for _ in range(PER_KIND)]
    order = rng.permutation(len(pictures))
    return [{"id": i + 1, "kind": pictures[j][0], "pixels": pictures[j][1]} for i, j in enumerate(order)]


def squared_distances(X: np.ndarray) -> np.ndarray:
    diff = X[:, None, :] - X[None, :, :]
    return (diff**2).sum(axis=2)


def conditional_p(D: np.ndarray, perplexity: float) -> np.ndarray:
    """scikit-learn's _binary_search_perplexity, in double precision."""
    n = len(D)
    P = np.zeros((n, n))
    desired = math.log(perplexity)
    for i in range(n):
        # Measured from the nearest neighbour, as the page does: this cancels
        # out, but a far-away point's row can then never underflow to zeros.
        d = D[i] - min(D[i, j] for j in range(n) if j != i)
        beta, lo, hi = 1.0, -math.inf, math.inf
        for _ in range(100):
            row = np.array([0.0 if j == i else math.exp(-d[j] * beta) for j in range(n)])
            total = row.sum()
            row = row / total
            entropy = math.log(total) + beta * float((d * row).sum())
            P[i] = row
            diff = entropy - desired
            if abs(diff) <= 1e-5:
                break
            if diff > 0:
                lo = beta
                beta = beta * 2 if hi == math.inf else (beta + hi) / 2
            else:
                hi = beta
                beta = beta / 2 if lo == -math.inf else (beta + lo) / 2
    return P


def joint_p(D: np.ndarray, perplexity: float) -> np.ndarray:
    P = conditional_p(D, perplexity)
    P = P + P.T
    return np.maximum(squareform(P, checks=False) / max(P.sum(), _t_sne.MACHINE_EPSILON), _t_sne.MACHINE_EPSILON)


def run(P: np.ndarray, start: np.ndarray, steps: int) -> np.ndarray:
    """scikit-learn's two stages: exaggerated P with momentum 0.5, then the
    real P with momentum 0.8 (the optimiser's memory resets in between)."""
    n = len(start)
    kwargs = {"P": P * EXAGGERATION, "degrees_of_freedom": 1, "n_samples": n, "n_components": 2}
    common = {"n_iter_check": 10**9, "n_iter_without_progress": 10**9, "min_grad_norm": 0.0, "learning_rate": LEARNING_RATE}
    p, _, it = _t_sne._gradient_descent(
        _t_sne._kl_divergence, start.ravel().copy(), 0, min(steps, EXAGGERATED_STEPS), momentum=0.5, kwargs=kwargs, **common
    )
    if steps > EXAGGERATED_STEPS:
        kwargs["P"] = P
        p, _, it = _t_sne._gradient_descent(_t_sne._kl_divergence, p, EXAGGERATED_STEPS, steps, momentum=0.8, kwargs=kwargs, **common)
    return p.reshape(n, 2)


def purity(M: np.ndarray, kinds: list[str], k: int = 5) -> float:
    """The share of each point's k nearest that are the same kind, on average."""
    n = len(M)
    near = [sorted((j for j in range(n) if j != i), key=lambda j: (M[i][j], j))[:k] for i in range(n)]
    return float(np.mean([np.mean([kinds[j] == kinds[i] for j in near[i]]) for i in range(n)]))


def finished(D: np.ndarray, P: np.ndarray, start: np.ndarray, kinds: list[str]) -> dict:
    Y = run(P, start, TOTAL_STEPS)
    kl, _ = _t_sne._kl_divergence(Y.ravel(), P, 1, len(Y), 2)
    return {"kl": float(kl), "purity": purity(squared_distances(Y), kinds), "pixelPurity": purity(D, kinds)}


def main() -> None:
    rng = np.random.default_rng(SEED)
    sets = [make_set(rng) for _ in range(SETS)]
    fixtures = []
    for index, rows in enumerate(sets):
        X = np.array([r["pixels"] for r in rows], dtype=float)
        D = squared_distances(X)
        # Start positions, as scikit-learn's random start: tiny random numbers.
        start = (rng.standard_normal((len(rows), 2)) * 1e-4).round(9)
        rows_start = start.tolist()
        per_perplexity = {}
        for perplexity in PERPLEXITIES:
            ours = joint_p(D, perplexity)
            theirs = _t_sne._joint_probabilities(D, perplexity, 0)
            assert np.allclose(ours, theirs, rtol=1e-4, atol=1e-9), "joint P differs from scikit-learn"
            probe = rng.standard_normal((len(rows), 2))
            kl, grad = _t_sne._kl_divergence(probe.ravel(), ours, 1, len(rows), 2)
            per_perplexity[str(perplexity)] = {
                "P": ours.tolist(),
                "probe": probe.tolist(),
                "kl": float(kl),
                "grad": grad.tolist(),
                "maps": {str(s): run(ours, start, s).tolist() for s in CHECK_STEPS},
                "finished": finished(D, ours, start, [r["kind"] for r in rows]),
            }
        fixtures.append(per_perplexity)
        sets[index] = [{**r, "start": rows_start[i]} for i, r in enumerate(rows)]
        print(f"set {index + 1}: joint P agrees with scikit-learn for perplexities {PERPLEXITIES}")

    dataset = {
        "id": "pictures",
        "title": "Tiny pictures",
        "question": "Which pictures look alike?",
        "note": (
            "The pictures are made up: four kinds of shape, drawn at slightly different "
            "places near the middle of an 8 × 8 grid, with a few smudged pixels."
        ),
        "size": SIZE,
        "kinds": [
            {"id": "across", "name": "bar across"},
            {"id": "down", "name": "bar down"},
            {"id": "slash", "name": "slash"},
            {"id": "backslash", "name": "backslash"},
        ],
        "schedule": {
            "exaggeration": EXAGGERATION,
            "exaggeratedSteps": EXAGGERATED_STEPS,
            "learningRate": LEARNING_RATE,
            "momentum": [0.5, 0.8],
            "totalSteps": TOTAL_STEPS,
        },
        "perplexity": {"min": 2, "max": 20, "step": 1, "initial": 8},
        "steps": {"min": 0, "max": TOTAL_STEPS, "step": 10, "initial": TOTAL_STEPS},
        "neighbours": 5,
        "batches": sets,
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(dataset, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    FIXTURES.write_text(json.dumps(fixtures, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
