"""Generate the Support Vector Machine data and its reference results.

The data is made up: 24 students, each with the hours they studied and the
hours they slept before a test, and whether they passed. Studying and sleep
both help, so the border is a slant, and a few students near it break the
rule, so the soft margin (C) matters. Both features are in hours, so the
chart can use the same scale across and up.

Writes:
- src/models/support-vector-machine/data/students.json   the sets
- tests/fixtures/support-vector-machine.json             scikit-learn's SVC
                                                         results, linear and RBF
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if (ROOT / ".pydeps").is_dir():
    sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np  # noqa: E402
from sklearn.svm import SVC  # noqa: E402

DATA = ROOT / "src" / "models" / "support-vector-machine" / "data" / "students.json"
FIXTURES = ROOT / "tests" / "fixtures" / "support-vector-machine.json"

SEED = 8
SETS = 5
STUDENTS = 24
AXES = {"x": [0, 10], "y": [0, 10]}
CLASSES = ["fail", "pass"]  # sorted: "pass" is the positive side, y = +1
GRID = 21
SETTINGS = [
    {"kernel": "linear", "C": 0.1},
    {"kernel": "linear", "C": 1.0},
    {"kernel": "linear", "C": 10.0},
    {"kernel": "rbf", "C": 1.0, "gamma": 0.5},
    {"kernel": "rbf", "C": 10.0, "gamma": 2.0},
]


def make_set(rng: np.random.Generator) -> list[dict]:
    students: list[tuple[float, float, str]] = []
    while len(students) < STUDENTS:
        x = round(float(rng.uniform(0.6, 9.4)), 1)
        y = round(float(rng.uniform(2.5, 9.6)), 1)
        if any(np.hypot(x - sx, y - sy) < 0.6 for sx, sy, _ in students):
            continue
        score = 0.6 * x + 0.45 * y
        passed = score > 6.3
        if abs(score - 6.3) < 0.8 and rng.random() < 0.25:
            passed = not passed
        students.append((x, y, "pass" if passed else "fail"))
    order = rng.permutation(len(students))
    return [{"id": i + 1, "x": students[j][0], "y": students[j][1], "label": students[j][2]} for i, j in enumerate(order)]


def fit(rows: list[dict], setting: dict) -> SVC:
    features = np.array([[r["x"], r["y"]] for r in rows])
    labels = np.array([r["label"] for r in rows])
    return SVC(
        kernel=setting["kernel"],
        C=setting["C"],
        gamma=setting.get("gamma", "scale"),
        tol=1e-10,
        shrinking=False,
    ).fit(features, labels)


def main() -> None:
    rng = np.random.default_rng(SEED)
    grid = [[float(x), float(y)] for y in np.linspace(*AXES["y"], GRID) for x in np.linspace(*AXES["x"], GRID)]
    sets, fixtures = [], []
    while len(sets) < SETS:
        rows = make_set(rng)
        passed = sum(r["label"] == "pass" for r in rows)
        if not 9 <= passed <= 15:
            continue
        # The first view (linear, C = 1) should need its soft margin: at
        # least one student inside the margin or on the wrong side.
        linear = fit(rows, {"kernel": "linear", "C": 1.0})
        signs = np.where(np.array([r["label"] for r in rows]) == "pass", 1, -1)
        margins = signs * linear.decision_function(np.array([[r["x"], r["y"]] for r in rows]))
        if not (margins < 0.999).sum() >= 3:
            continue
        per_setting = []
        for setting in SETTINGS:
            model = fit(rows, setting)
            per_setting.append(
                {
                    **setting,
                    "grid": model.decision_function(np.array(grid)).round(9).tolist(),
                    "support": (model.support_ + 1).tolist(),  # row ids
                    "alpha": np.abs(model.dual_coef_[0]).round(9).tolist(),
                    "intercept": float(model.intercept_[0]),
                }
            )
        sets.append(rows)
        fixtures.append({"settings": per_setting, "gridAxes": AXES, "gridSize": GRID})
        print(f"set {len(sets)}: {passed} of {STUDENTS} passed; support vectors (linear, C=1): {len(linear.support_)}")

    dataset = {
        "id": "students",
        "title": "Students and a test",
        "question": "Will this student pass?",
        "note": (
            "The students are made up: studying and sleep both help, and a "
            "few students near the border break the rule."
        ),
        "columns": [
            {"key": "x", "label": "Hours studied", "short": "Studied", "unit": "h", "role": "x", "decimals": 1},
            {"key": "y", "label": "Hours slept", "short": "Slept", "unit": "h", "role": "y", "decimals": 1},
        ],
        "classes": [
            {"id": "fail", "name": "failed", "short": "fail", "shape": "triangle", "sign": -1},
            {"id": "pass", "name": "passed", "short": "pass", "shape": "circle", "sign": 1},
        ],
        "axes": AXES,
        # Sliders move in powers of ten: C = 10^s, γ = 10^s.
        "logC": {"min": -2, "max": 2, "step": 0.25, "initial": 0},
        "logGamma": {"min": -1.5, "max": 1, "step": 0.25, "initial": -0.5},
        "batches": sets,
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    FIXTURES.write_text(json.dumps(fixtures, indent=1) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
