"""Generate the A/B Testing scenarios and their reference results.

StylePulse, a made-up online clothes shop, tests a new search ranking
(RankNet-v2) against the old one. 100,000 people search each day; each is
shown one ranking (control or treatment), 50/50. One simulated row is one
searcher on one day: 8% buy something, and a basket is Gamma-distributed with
mean $62.50 and sd $37.50, so spend per searcher per day has mean $5.00 and
sd $20.00. The treatment changes how many people buy.

Six scenarios, each with its own lesson. For each one the script tries seeds
in order and keeps the first whose outcome teaches it (the goals in GOALS).
The page gets daily totals per group (users, mean and sd of spend, buyers,
checkout errors, latency); those are all the test needs. The reference
results are computed with SciPy from the rounded totals, so the page must
match them exactly.

Writes:
- src/models/a-b-testing/data/tests.json   the scenarios and the settings
- tests/fixtures/a-b-testing.json          SciPy results for every day,
                                           sample sizes and A/A runs
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from rng import mulberry32  # noqa: E402

DATA = ROOT / "src" / "models" / "a-b-testing" / "data" / "tests.json"
FIXTURES = ROOT / "tests" / "fixtures" / "a-b-testing.json"

SEARCHERS = 100_000
DAYS = 14
BUY = 0.08
BASKET_MEAN, BASKET_SD = 62.5, 37.5
MEAN, SD = BUY * BASKET_MEAN, 20.0  # spend per searcher per day
ERROR_RATE = 0.004  # checkouts that fail
LATENCY = 140.0  # ms
ALPHA, POWER, MDE = 0.05, 0.80, 0.02
SPLIT_LIMIT = 0.001
LIMITS = {"latency": 10.0, "errors": 0.1}
AA_SEED, AA_TESTS, AA_PATHS = 2026, 10_000, 20


def basket(mean: float, sd: float) -> tuple[float, float]:
    """Gamma shape and scale for a basket with this mean and sd."""
    return (mean / sd) ** 2, sd * sd / mean


def spend(rng: np.random.Generator, n: int, buy: float, mean=BASKET_MEAN, sd=BASKET_SD) -> np.ndarray:
    """What the buyers among n searchers spend (everyone else spends $0)."""
    k, scale = basket(mean, sd)
    return rng.gamma(k, scale, rng.binomial(n, buy))


def group(n: int, baskets: np.ndarray, errors: int, latency: float) -> dict:
    total, squares = baskets.sum(), (baskets * baskets).sum()
    mean = total / n
    var = (squares - total * total / n) / (n - 1)
    return {
        "n": int(n),
        "mean": round(float(mean), 6),
        "sd": round(math.sqrt(var), 6),
        "buyers": int(len(baskets)),
        "errors": int(errors),
        "latency": round(float(latency), 1),
    }


def lift_on(kind: str, day: int) -> float:
    return {
        "aa": 0.0,
        "win": 0.04,
        "modest": 0.02,
        "holiday": 0.02,
        "bug": 0.0,
        "novelty": 0.003 + 0.08 * math.exp(-(day - 1) / 4),
    }[kind]


def simulate(kind: str, seed: int) -> list[dict]:
    rng = np.random.default_rng(seed)
    days = []
    for day in range(1, DAYS + 1):
        total = int(rng.poisson(SEARCHERS))
        n_c = int(rng.binomial(total, 0.5))
        n_t = total - n_c
        buy, mean, sd = BUY, BASKET_MEAN, BASKET_SD
        if kind == "holiday" and day >= 8:
            # Black Friday week: more buyers, bigger and much more varied baskets.
            buy, mean, sd = 0.11, 85.0, 120.0
        if kind == "bug":
            # 20% of searchers use old Android phones and buy less (3%). In
            # treatment, RankNet-v2 crashes for half of them before they are
            # logged, so they vanish from the data.
            def logged(n: int, keep_old: float) -> tuple[int, np.ndarray]:
                old = int(rng.binomial(n, 0.2))
                kept = int(rng.binomial(old, keep_old))
                x = np.concatenate([spend(rng, kept, 0.03), spend(rng, n - old, 0.0925)])
                return kept + n - old, x

            n_c, x_c = logged(n_c, 1.0)
            n_t, x_t = logged(n_t, 0.5)
        else:
            x_c = spend(rng, n_c, buy, mean, sd)
            x_t = spend(rng, n_t, buy * (1 + lift_on(kind, day)), mean, sd)
        slower = {"aa": 0.0, "bug": 38.0}.get(kind, 4.0)
        days.append(
            {
                "day": day,
                "control": group(
                    n_c, x_c, rng.binomial(len(x_c), ERROR_RATE), LATENCY + rng.normal(0, 0.4)
                ),
                "treatment": group(
                    n_t, x_t, rng.binomial(len(x_t), ERROR_RATE), LATENCY + slower + rng.normal(0, 0.4)
                ),
            }
        )
    return days


def two_weeks(lift: float, searchers: int, seed: int) -> dict:
    """One whole 14-day test at once: each group's users, mean and sd."""
    rng = np.random.default_rng(seed)
    total = int(rng.poisson(searchers * DAYS))
    n_c = int(rng.binomial(total, 0.5))
    n_t = total - n_c
    totals = {}
    for arm, n, buy in [("control", n_c, BUY), ("treatment", n_t, BUY * (1 + lift))]:
        g = group(n, spend(rng, n, buy), 0, LATENCY)
        totals[arm] = {"n": g["n"], "mean": g["mean"], "sd": g["sd"]}
    return totals


# The six cases of step 7, each drawn from a real simulated test: the true
# lift, the traffic (searchers a day) and what the interval must show.
CASES = [
    {"id": "win", "name": "Clear win", "verdict": "Launch", "lift": 0.04, "searchers": SEARCHERS},
    {"id": "borderline", "name": "Borderline", "verdict": "Run a longer test", "lift": 0.02, "searchers": SEARCHERS},
    # Real but too small needs an interval narrower than the MDE: 4× the traffic.
    {
        "id": "small",
        "name": "Real but too small",
        "verdict": "Don’t launch",
        "lift": 0.01,
        "searchers": 4 * SEARCHERS,
    },
    {"id": "uncertain", "name": "Too uncertain", "verdict": "Run a bigger test", "lift": 0.01, "searchers": SEARCHERS},
    {"id": "none", "name": "No useful effect", "verdict": "Don’t launch", "lift": 0.0, "searchers": SEARCHERS},
    {"id": "worse", "name": "Worse", "verdict": "Don’t launch", "lift": -0.03, "searchers": SEARCHERS},
]


def interval(totals: dict, alpha: float = ALPHA) -> tuple[float, float, float]:
    """The lift and its interval, as fractions of the control mean."""
    c, t = totals["control"], totals["treatment"]
    diff = t["mean"] - c["mean"]
    se = math.sqrt(t["sd"] ** 2 / t["n"] + c["sd"] ** 2 / c["n"])
    crit = float(stats.norm.ppf(1 - alpha / 2))
    return diff / c["mean"], (diff - crit * se) / c["mean"], (diff + crit * se) / c["mean"]


def six_cases() -> list[dict]:
    cases = []
    for i, case in enumerate(CASES):
        for seed in range(1000 * (i + 1), 1000 * (i + 1) + 500):
            totals = two_weeks(case["lift"], case["searchers"], seed)
            lift, lo, hi = interval(totals)
            if ci_case(lo, hi) == case["id"]:
                break
        else:
            raise SystemExit(f"case {case['id']}: no seed lands in it")
        cases.append(case | {"seed": seed} | totals)
        print(f"case {case['id']:10} seed {seed}: {lift:+.2%} [{lo:+.2%}, {hi:+.2%}]")
    return cases


# ── The analysis, as the page does it (z-test on pooled daily totals) ──────────


def pool(days: list[dict], arm: str) -> tuple[int, float, float]:
    n = sum(d[arm]["n"] for d in days)
    mean = sum(d[arm]["n"] * d[arm]["mean"] for d in days) / n
    m2 = sum((d[arm]["n"] - 1) * d[arm]["sd"] ** 2 + d[arm]["n"] * (d[arm]["mean"] - mean) ** 2 for d in days)
    return n, mean, math.sqrt(m2 / (n - 1))


def analyse(days: list[dict], alpha: float = ALPHA) -> dict:
    n_c, m_c, s_c = pool(days, "control")
    n_t, m_t, s_t = pool(days, "treatment")
    diff = m_t - m_c
    se = math.sqrt(s_t**2 / n_t + s_c**2 / n_c)
    z = diff / se
    crit = float(stats.norm.ppf(1 - alpha / 2))
    split = stats.chisquare([n_c, n_t])
    welch = stats.ttest_ind_from_stats(m_t, s_t, n_t, m_c, s_c, n_c, equal_var=False)
    return {
        "nC": n_c,
        "nT": n_t,
        "meanC": m_c,
        "meanT": m_t,
        "sdC": s_c,
        "sdT": s_t,
        "diff": diff,
        "se": se,
        "z": z,
        "p": float(2 * stats.norm.sf(abs(z))),
        "lo": (diff - crit * se) / m_c,
        "hi": (diff + crit * se) / m_c,
        "chi2": float(split.statistic),
        "splitP": float(split.pvalue),
        "welchP": float(welch.pvalue),
    }


def ci_case(lo: float, hi: float, mde: float = MDE) -> str:
    if lo > mde:
        return "win"
    if hi < 0:
        return "worse"
    if lo > 0 and hi < mde:
        return "small"
    if lo > 0:
        return "borderline"
    if hi < mde:
        return "none"
    return "uncertain"


def fade(days: list[dict]) -> dict:
    first, last = analyse(days[:7]), analyse(days[-7:])
    se1, se2 = first["se"] / first["meanC"], last["se"] / last["meanC"]
    z = (first["diff"] / first["meanC"] - last["diff"] / last["meanC"]) / math.hypot(se1, se2)
    return {
        "first": first["diff"] / first["meanC"],
        "last": last["diff"] / last["meanC"],
        "z": z,
        "p": float(2 * stats.norm.sf(abs(z))),
    }


def sample_size(alpha: float, power: float, mde: float) -> float:
    za, zb = stats.norm.ppf(1 - alpha / 2), stats.norm.ppf(power)
    return float(2 * (za + zb) ** 2 * SD**2 / (mde * MEAN) ** 2)


def planned_days(n: float) -> int:
    days = math.ceil(n / (SEARCHERS / 2))
    return max(7, math.ceil(days / 7) * 7)


def aa_runs(seed: int, tests: int, looks: int, alpha: float = ALPHA) -> dict:
    """A/A tests as z-paths: each day adds an independent N(0, 1) step.

    Normals come from mulberry32 by Box–Muller, two per pair of numbers,
    exactly as math.ts draws them.
    """
    rand = mulberry32(seed)
    spare: list[float] = []

    def normal() -> float:
        if spare:
            return spare.pop()
        u, v = 1 - rand(), rand()
        r = math.sqrt(-2 * math.log(u))
        spare.append(r * math.sin(2 * math.pi * v))
        return r * math.cos(2 * math.pi * v)

    crit = float(stats.norm.ppf(1 - alpha / 2))
    ever = end = 0
    first_path = []
    for t in range(tests):
        total, crossed, path = 0.0, False, []
        for k in range(1, looks + 1):
            total += normal()
            z = total / math.sqrt(k)
            path.append(z)
            crossed = crossed or abs(z) > crit
        ever += crossed
        end += abs(path[-1]) > crit
        if t == 0:
            first_path = path
    return {"tests": tests, "ever": ever, "end": end, "firstPath": first_path}


# ── Seeds ──────────────────────────────────────────────────────────────────────


def split_ok(days: list[dict]) -> bool:
    return all(analyse(days[:d])["splitP"] > 0.05 for d in range(1, DAYS + 1))


GOALS = {
    # The peeking trap: a "win" on day 3 for a change that changed nothing.
    "aa": lambda days, full: (
        split_ok(days)
        and analyse(days[:1])["p"] > 0.1
        and analyse(days[:3])["p"] < 0.05
        and analyse(days[:3])["diff"] > 0
        and full["p"] > 0.3
        and ci_case(full["lo"], full["hi"]) == "none"
    ),
    "win": lambda days, full: split_ok(days) and ci_case(full["lo"], full["hi"]) == "win",
    "modest": lambda days, full: (
        split_ok(days) and ci_case(full["lo"], full["hi"]) == "borderline" and full["p"] < 0.01
    ),
    "holiday": lambda days, full: (
        split_ok(days) and ci_case(full["lo"], full["hi"]) == "uncertain" and analyse(days[:7])["p"] < 0.05
    ),
    "bug": lambda days, full: full["splitP"] < SPLIT_LIMIT,
    "novelty": lambda days, full: (
        split_ok(days)
        and fade(days)["p"] < 0.01
        and fade(days)["last"] < 0.01
        and ci_case(full["lo"], full["hi"]) in ("win", "borderline")
    ),
}

SCENARIOS = [
    {
        "id": "aa",
        "base": 100,
        "title": "A/A test",
        "story": "Before testing RankNet-v2, StylePulse shows the old ranking to both groups, to check the setup.",
        "truth": "Nothing changed: both groups saw the old ranking.",
        "note": "As expected: nothing changed, so the setup works.",
    },
    {
        "id": "win",
        "base": 200,
        "title": "Clear win",
        "story": "RankNet-v2 against the old ranking, on two ordinary weeks.",
        "truth": "RankNet-v2 made 4% more searchers buy something.",
        "note": "",
    },
    {
        "id": "modest",
        "base": 300,
        "title": "Modest lift",
        "story": "A lighter version of RankNet-v2, on two ordinary weeks.",
        "truth": "This version made 2% more searchers buy: exactly the MDE.",
        "note": "",
    },
    {
        "id": "holiday",
        "base": 400,
        "title": "Holiday rush",
        "story": "RankNet-v2 again, but Black Friday falls in week 2.",
        "truth": "A real +2% lift, but in week 2 more people bought, with much bigger and more varied baskets.",
        "note": "Black Friday made spending far noisier in week 2.",
    },
    {
        "id": "bug",
        "base": 500,
        "title": "Tracking bug",
        "story": "RankNet-v2, but its new page crashes on old Android phones.",
        "truth": "No real effect. Half the old-Android users in treatment were never logged, and they buy less.",
        "note": "The missing users were the ones who buy least, so the lift is fake.",
    },
    {
        "id": "novelty",
        "base": 600,
        "title": "Novelty",
        "story": "A flashy redesign of the results page.",
        "truth": "People clicked around at first: +8% on day 1, fading to under 1% by week 2.",
        "note": "",
    },
]


def sample_rows(seed: int = 7) -> list[dict]:
    """Five raw rows, as the shop's logs would hold them: three searchers who
    bought nothing that day and two who did (most rows are $0)."""
    rng = np.random.default_rng(seed)
    k, scale = basket(BASKET_MEAN, BASKET_SD)
    buyers, others = [], []
    while len(buyers) < 2 or len(others) < 3:
        group_name = "treatment" if rng.random() < 0.5 else "control"
        buy = BUY * (1.04 if group_name == "treatment" else 1)
        bought = rng.random() < buy
        row = {
            "user": f"usr_{rng.integers(10_000, 99_999)}",
            "day": int(rng.integers(1, DAYS + 1)),
            "group": group_name,
            "spent": round(float(rng.gamma(k, scale)), 2) if bought else 0.0,
            "latency": int(round(rng.normal(LATENCY + (4 if group_name == "treatment" else 0), 25))),
        }
        (buyers if bought else others).append(row)
    return sorted(buyers[:2] + others[:3], key=lambda r: r["day"])


def main() -> None:
    tests, fixtures = [], {"scenarios": {}}
    for scenario in SCENARIOS:
        kind = scenario["id"]
        for seed in range(scenario["base"], scenario["base"] + 500):
            days = simulate(kind, seed)
            full = analyse(days)
            if GOALS[kind](days, full):
                break
        else:
            raise SystemExit(f"{kind}: no seed meets the goals")
        tests.append({k: v for k, v in scenario.items() if k != "base"} | {"seed": seed, "days": days})
        fixtures["scenarios"][kind] = {
            "days": [analyse(days[:d]) for d in range(1, DAYS + 1)],
            "alpha10": [analyse(days[:d], 0.10) for d in range(1, DAYS + 1)],
            "case": ci_case(full["lo"], full["hi"]),
            "fade": fade(days),
        }
        early = analyse(days[:3])
        print(
            f"{kind:8} seed {seed}: day 3 {early['diff'] / early['meanC']:+.2%} (p {early['p']:.3f}); "
            f"day 14 {full['diff'] / full['meanC']:+.2%} [{full['lo']:+.2%}, {full['hi']:+.2%}] "
            f"p {full['p']:.3g}, split p {full['splitP']:.3g}: {ci_case(full['lo'], full['hi'])}"
        )

    fixtures["sampleSizes"] = [
        {"alpha": a, "power": pw, "mde": m, "n": sample_size(a, pw, m), "days": planned_days(sample_size(a, pw, m))}
        for a, pw, m in [
            (0.05, 0.8, 0.02),
            (0.05, 0.8, 0.01),
            (0.05, 0.8, 0.03),
            (0.05, 0.8, 0.04),
            (0.05, 0.9, 0.02),
            (0.01, 0.8, 0.02),
            (0.1, 0.5, 0.05),
        ]
    ]
    fixtures["quantiles"] = {str(p): float(stats.norm.ppf(p)) for p in [0.5, 0.8, 0.9, 0.95, 0.975, 0.995, 0.999]}
    fixtures["tails"] = {str(z): float(2 * stats.norm.sf(z)) for z in [0, 0.5, 1, 1.96, 2, 3, 5, 8, 12, 20, 30]}
    fixtures["aaRuns"] = aa_runs(AA_SEED, AA_TESTS, DAYS)
    runs = fixtures["aaRuns"]
    print(f"A/A runs: {runs['ever'] / AA_TESTS:.1%} ever cross, {runs['end'] / AA_TESTS:.1%} at the end")
    cases = six_cases()
    fixtures["cases"] = {c["id"]: dict(zip(("lift", "lo", "hi"), interval(c), strict=True)) for c in cases}

    dataset = {
        "id": "stylepulse",
        "title": "StylePulse tests RankNet-v2",
        "question": "Should StylePulse launch its new search ranking?",
        "note": "The shop and its numbers are made up, but they behave like real shop data: most searchers spend $0.",
        "searchersPerDay": SEARCHERS,
        "buyRate": BUY,
        "history": {"mean": MEAN, "sd": SD},
        "splitLimit": SPLIT_LIMIT,
        "limits": LIMITS,
        "aa": {"seed": AA_SEED, "tests": AA_TESTS, "paths": AA_PATHS},
        "day": {"min": 1, "max": DAYS, "step": 1, "initial": 1},
        "mde": {"min": 0.5, "max": 5, "step": 0.5, "initial": MDE * 100},
        "alpha": {"min": 0.01, "max": 0.1, "step": 0.01, "initial": ALPHA},
        "power": {"min": 0.5, "max": 0.95, "step": 0.05, "initial": POWER},
        "cost": {"min": 0, "max": 30000, "step": 500, "initial": 4000},
        "sample": sample_rows(),
        "cases": cases,
        "tests": tests,
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(dataset, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    FIXTURES.write_text(json.dumps(fixtures, indent=1) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
