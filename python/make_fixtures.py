"""Compute reference results with scikit-learn.

For each dataset written by prepare_data.py this adds to its JSON:

- reference    for every batch: best a and b, MSE, R², means, flat-line MSE
               and a few predictions
- gd           gradient-descent defaults (learning rate, speed in steps per frame)
- predictAxes  axis ranges for predicting beyond the data

and writes the same reference results to tests/fixtures/linear-regression.json,
which the TypeScript math tests compare against.
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
from sklearn.linear_model import LinearRegression  # noqa: E402
from sklearn.metrics import mean_squared_error, r2_score  # noqa: E402

DATA = ROOT / "src" / "models" / "linear-regression" / "data"
FIXTURES = ROOT / "tests" / "fixtures" / "linear-regression.json"

FRAMES_PER_RUN = 240  # about 4 seconds at 60 frames per second
GD_TOLERANCE = 1e-6  # stop when the gradient is this fraction of its starting size
GD_MAX_STEPS = 100_000


def nice_ceil(value: float) -> float:
    """Round up to 1, 2 or 5 times a power of ten."""
    if value <= 0:
        return 0.0
    power = 10 ** math.floor(math.log10(value))
    return next(m * power for m in (1, 2, 5, 10) if m * power >= value)


def reference(x: np.ndarray, y: np.ndarray) -> dict:
    model = LinearRegression().fit(x.reshape(-1, 1), y)
    a, b = float(model.intercept_), float(model.coef_[0])
    fitted = model.predict(x.reshape(-1, 1))
    return {
        "n": int(len(x)),
        "a": a,
        "b": b,
        "mse": float(mean_squared_error(y, fitted)),
        "r2": float(r2_score(y, fitted)),
        "xMean": float(x.mean()),
        "yMean": float(y.mean()),
        "flatMse": float(((y - y.mean()) ** 2).mean()),
        "predictAt0": a,
        "predictAtMean": a + b * float(x.mean()),
        "predictAtMax": a + b * float(x.max()),
    }


def gradient_descent_defaults(x: np.ndarray, a0: float, b0: float, best: tuple[float, float]) -> dict:
    # MSE is a quadratic bowl with Hessian 2·[[1, x̄], [x̄, mean(x²)]]. Steps are
    # stable below 2 / λmax; the default is half of that.
    hessian = 2 * np.array([[1.0, x.mean()], [x.mean(), (x**2).mean()]])
    rate = 1 / float(np.linalg.eigvalsh(hessian).max())
    a_best, b_best = best
    a, b = a0, b0
    start = None
    steps = 0
    while steps < GD_MAX_STEPS:
        grad = hessian @ np.array([a - a_best, b - b_best])
        size = float(np.hypot(*grad))
        start = size if start is None else start
        if size <= GD_TOLERANCE * start:
            break
        a, b = a - rate * grad[0], b - rate * grad[1]
        steps += 1
    return {
        "learningRate": rate,
        "maxLearningRate": 10 * rate,  # 5× the stable limit, so divergence can be shown
        "stepsPerFrame": int(min(200, max(1, math.ceil(steps / FRAMES_PER_RUN)))),
        "stepsToConverge": steps,
    }


def main() -> None:
    fixtures = {}
    for path in sorted(DATA.glob("*.json")):
        dataset = json.loads(path.read_text(encoding="utf-8"))
        refs = []
        for batch in dataset["batches"]:
            x = np.array([r["x"] for r in batch], dtype=float)
            y = np.array([r["y"] for r in batch], dtype=float)
            refs.append(reference(x, y))

        # Gradient-descent defaults and Predict axes come from all batches.
        x_all = np.array([r["x"] for b in dataset["batches"] for r in b], dtype=float)
        y_all = np.array([r["y"] for b in dataset["batches"] for r in b], dtype=float)
        pooled = reference(x_all, y_all)
        params = dataset["params"]
        dataset["reference"] = refs
        dataset["gd"] = gradient_descent_defaults(
            x_all, params["a"]["initial"], params["b"]["initial"], (pooled["a"], pooled["b"])
        )
        x_max = nice_ceil(2 * x_all.max())
        ends = [pooled["a"], pooled["a"] + pooled["b"] * x_max]
        dataset["predictAxes"] = {
            "x": [0, x_max],
            "y": [
                min(dataset["axes"]["y"][0], math.floor(min(ends) / 10) * 10),
                max(dataset["axes"]["y"][1], math.ceil(max(ends) / 10) * 10),
            ],
        }
        path.write_text(
            json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
        )
        fixtures[dataset["id"]] = refs
        for i, ref in enumerate(refs, 1):
            print(f"{dataset['id']} batch {i}: y = {ref['a']:.2f} + {ref['b']:.2f}x  typical miss {ref['mse'] ** 0.5:.1f}")

    FIXTURES.parent.mkdir(parents=True, exist_ok=True)
    FIXTURES.write_text(json.dumps(fixtures, indent=2) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
