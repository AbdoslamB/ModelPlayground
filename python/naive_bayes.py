"""Generate the Naive Bayes data and its reference results.

The data is made up: 25 short training messages, 10 spam and 15 normal, in
simple words, and a few example messages to try. Most real messages are
normal, so the model starts out leaning that way. The page counts how often
each word appears in each kind of message and adds up the evidence.

Writes:
- src/models/naive-bayes/data/messages.json   training and example messages
- tests/fixtures/naive-bayes.json             scikit-learn's word
                                              probabilities and spam chances
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if (ROOT / ".pydeps").is_dir():
    sys.path.insert(0, str(ROOT / ".pydeps"))

import numpy as np  # noqa: E402
from sklearn.feature_extraction.text import CountVectorizer  # noqa: E402
from sklearn.naive_bayes import MultinomialNB  # noqa: E402

DATA = ROOT / "src" / "models" / "naive-bayes" / "data" / "messages.json"
FIXTURES = ROOT / "tests" / "fixtures" / "naive-bayes.json"

SPAM = [
    "win a free prize now",
    "claim your free money today",
    "you won cash click now",
    "free gift card click here",
    "urgent offer win money",
    "cheap deal buy now",
    "click here to claim your prize",
    "limited offer free cash",
    "win big money today",
    "act now free offer",
]
NORMAL = [
    "are we still meeting for lunch today",
    "can you send me the report",
    "see you at the meeting tomorrow",
    "thanks for the lunch",
    "here is the report for today",
    "call me when you get home",
    "the meeting moved to friday",
    "can we talk tomorrow",
    "happy birthday see you soon",
    "please send the photos from friday",
    "dinner is at home tonight",
    "did you get my message",
    "the train is late again",
    "lunch at noon works for me",
    "we won the game today",
]
EXAMPLES = [
    "win a free lunch today",
    "can you send the prize money now",
    "see you at lunch tomorrow",
    "click here for the free report",
    "you won a free gift card",
    "thanks see you friday",
]
ALPHAS = [0.1, 0.5, 1.0, 2.0]
# Text the page must split into words exactly as scikit-learn does.
TRICKY = [
    "Hi!! It's 2 FREE-prizes, café_1 & a b c",
    "WIN   win\tWin\nwinning",
    "x y z 42 4 ok",
    "café naïve résumé Ünïcode",
    "",
]


def main() -> None:
    texts = SPAM + NORMAL
    labels = ["spam"] * len(SPAM) + ["normal"] * len(NORMAL)
    # The page splits words the same way: runs of two or more letters,
    # lower-cased (scikit-learn's default token pattern).
    vectorizer = CountVectorizer()
    counts = vectorizer.fit_transform(texts)
    vocabulary = vectorizer.get_feature_names_out().tolist()

    analyzer = vectorizer.build_analyzer()
    fixtures = {
        "vocabulary": vocabulary,
        "tokens": [{"text": t, "words": analyzer(t)} for t in TRICKY + EXAMPLES],
        "alphas": {},
    }
    for alpha in ALPHAS:
        model = MultinomialNB(alpha=alpha).fit(counts, labels)
        classes = model.classes_.tolist()  # ['normal', 'spam']
        word_probs = np.exp(model.feature_log_prob_)
        chances = model.predict_proba(vectorizer.transform(EXAMPLES))
        fixtures["alphas"][str(alpha)] = {
            "wordProbability": {
                cls: dict(zip(vocabulary, word_probs[i].round(12).tolist()))
                for i, cls in enumerate(classes)
            },
            "spamChance": chances[:, classes.index("spam")].round(12).tolist(),
            "classPrior": dict(zip(classes, np.exp(model.class_log_prior_).round(12).tolist())),
        }

    dataset = {
        "id": "messages",
        "title": "Spam or not",
        "question": "Is this message spam?",
        "note": (
            "The messages are made up: 10 spam and 15 normal, in simple "
            "words, so every count is easy to follow."
        ),
        "classes": [
            {"id": "spam", "name": "spam", "plural": "spam messages"},
            {"id": "normal", "name": "normal", "plural": "normal messages"},
        ],
        "training": [{"id": i + 1, "text": t, "label": l} for i, (t, l) in enumerate(zip(texts, labels))],
        "examples": EXAMPLES,
        "alphas": {"min": 0.1, "max": 2, "step": 0.1, "initial": 1},
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(dataset, indent=2) + "\n", encoding="utf-8", newline="\n")
    FIXTURES.write_text(json.dumps(fixtures, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(vocabulary)} words in the vocabulary")
    for text, p in zip(EXAMPLES, fixtures["alphas"]["1.0"]["spamChance"]):
        print(f"  {p:6.1%} spam  {text}")


if __name__ == "__main__":
    main()
