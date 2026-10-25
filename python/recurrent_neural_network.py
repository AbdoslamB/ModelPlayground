"""Train the Recurrent Neural Network and write its weights and reference results.

The text is made up: short, simple sentences like "the cat sat on the mat."
A small character-level RNN (20 hidden numbers) reads them one character at
a time and learns to guess the next character. It is trained here with
numpy (backpropagation through time, Adam); the page only runs it forward.

The shipped weights are rounded to 4 decimals, and the reference results are
computed from those rounded weights, so the page must match them exactly.

Writes:
- src/models/recurrent-neural-network/data/rnn.json   weights, alphabet, examples
- tests/fixtures/recurrent-neural-network.json         hidden states and
                                                       probabilities for test texts
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if (ROOT / ".pydeps").is_dir():
    sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np  # noqa: E402

DATA = ROOT / "src" / "models" / "recurrent-neural-network" / "data" / "rnn.json"
FIXTURES = ROOT / "tests" / "fixtures" / "recurrent-neural-network.json"

SEED = 3
HIDDEN = 20
SEQUENCE = 40
STEPS = 6000
LEARNING_RATE = 0.01
DECIMALS = 4

SUBJECTS = ["the cat", "the dog", "a bird", "my friend", "the fox", "a duck", "the frog", "my cat"]
VERBS = ["sat on", "ran to", "looked at", "jumped on", "slept on", "hid in", "sang to", "went to"]
OBJECTS = ["the mat", "the log", "the tree", "the park", "a box", "the pond", "the hill", "a bed"]
EXAMPLES = [
    "the cat sat on the mat.",
    "a bird sang to the tree.",
    "my friend went to the park.",
    "the frog jumped on a log.",
    "the dog hid in a box.",
]
TEST_TEXTS = ["the cat sat on the mat.", "a duck ran to the pond.", "zq x", "the"]


def corpus(rng: np.random.Generator, sentences: int = 600) -> str:
    return " ".join(
        f"{SUBJECTS[rng.integers(len(SUBJECTS))]} {VERBS[rng.integers(len(VERBS))]} {OBJECTS[rng.integers(len(OBJECTS))]}."
        for _ in range(sentences)
    )


def forward(W: dict, ids: list[int], h: np.ndarray) -> tuple[list[np.ndarray], list[np.ndarray]]:
    """Hidden states and logits for each step: hₜ = tanh(Wₓ xₜ + Wₕ hₜ₋₁ + b), zₜ = W_y hₜ + c."""
    hs, zs = [], []
    for i in ids:
        h = np.tanh(W["Wx"][:, i] + W["Wh"] @ h + W["b"])
        hs.append(h)
        zs.append(W["Wy"] @ h + W["c"])
    return hs, zs


def softmax(z: np.ndarray, temperature: float = 1.0) -> np.ndarray:
    e = np.exp((z - z.max()) / temperature)
    return e / e.sum()


def train(text: str, alphabet: str, rng: np.random.Generator) -> dict:
    V, H = len(alphabet), HIDDEN
    index = {c: i for i, c in enumerate(alphabet)}
    data = [index[c] for c in text]
    W = {
        "Wx": rng.normal(0, 0.1, (H, V)),
        "Wh": rng.normal(0, 0.1, (H, H)),
        "b": np.zeros(H),
        "Wy": rng.normal(0, 0.1, (V, H)),
        "c": np.zeros(V),
    }
    m = {k: np.zeros_like(v) for k, v in W.items()}
    s = {k: np.zeros_like(v) for k, v in W.items()}
    h = np.zeros(H)
    pos, smooth = 0, np.log(V)
    for step in range(1, STEPS + 1):
        if pos + SEQUENCE + 1 >= len(data):
            pos, h = 0, np.zeros(H)
        xs, ys = data[pos : pos + SEQUENCE], data[pos + 1 : pos + SEQUENCE + 1]
        hs, zs = forward(W, xs, h)
        loss, grads = 0.0, {k: np.zeros_like(v) for k, v in W.items()}
        dh_next = np.zeros(H)
        for t in reversed(range(SEQUENCE)):
            p = softmax(zs[t])
            loss -= np.log(p[ys[t]])
            dz = p.copy()
            dz[ys[t]] -= 1
            grads["Wy"] += np.outer(dz, hs[t])
            grads["c"] += dz
            dh = W["Wy"].T @ dz + dh_next
            draw = (1 - hs[t] ** 2) * dh
            grads["b"] += draw
            grads["Wx"][:, xs[t]] += draw
            prev = hs[t - 1] if t > 0 else h
            grads["Wh"] += np.outer(draw, prev)
            dh_next = W["Wh"].T @ draw
        for k in W:
            g = np.clip(grads[k] / SEQUENCE, -5, 5)
            m[k] = 0.9 * m[k] + 0.1 * g
            s[k] = 0.999 * s[k] + 0.001 * g**2
            W[k] -= LEARNING_RATE * (m[k] / (1 - 0.9**step)) / (np.sqrt(s[k] / (1 - 0.999**step)) + 1e-8)
        h = hs[-1]
        pos += SEQUENCE
        smooth = 0.99 * smooth + 0.01 * loss / SEQUENCE
        if step % 1000 == 0:
            print(f"step {step}: loss {smooth:.3f} nats per character")
    return {k: np.round(v, DECIMALS) for k, v in W.items()}


def main() -> None:
    rng = np.random.default_rng(SEED)
    text = corpus(rng)
    alphabet = "".join(sorted(set(text)))
    W = train(text, alphabet, rng)
    index = {c: i for i, c in enumerate(alphabet)}

    fixtures = []
    for sample in TEST_TEXTS:
        ids = [index[c] for c in sample if c in index]
        hs, zs = forward(W, ids, np.zeros(HIDDEN))
        fixtures.append(
            {
                "text": sample,
                "hidden": [h.tolist() for h in hs],
                "logits": [z.tolist() for z in zs],
                "probabilities": {str(t): [softmax(z, t).tolist() for z in zs] for t in (1.0, 0.5, 2.0)},
            }
        )
    hs, zs = forward(W, [index[c] for c in EXAMPLES[0]], np.zeros(HIDDEN))
    guesses = [alphabet[int(np.argmax(z))] for z in zs]
    print("after each character of the first example, the best guess:", "".join(guesses))

    dataset = {
        "id": "rnn",
        "title": "Simple sentences",
        "question": "What letter comes next?",
        "note": "The sentences are made up: who did what, and where, in simple words.",
        "alphabet": alphabet,
        "hidden": HIDDEN,
        "weights": {k: v.tolist() for k, v in W.items()},
        "examples": EXAMPLES,
        "words": {"subjects": SUBJECTS, "verbs": VERBS, "objects": OBJECTS},
        "temperature": {"min": 0.2, "max": 2, "step": 0.1, "initial": 1},
        "maxSteps": 40,
        "seed": 11,
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(dataset, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")
    FIXTURES.write_text(json.dumps(fixtures, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
