/**
 * The Python versions of the Lab, as text. They learn from the Lab's
 * training messages and read the Lab's message with its α and switched-off
 * words, so the numbers they print are the numbers the Lab shows.
 * python.test.ts runs them and checks that.
 */
import type { Message } from './math';

import { pyNumber, pyString } from '../../lib/pycode';

export interface PythonData {
  title: string;
  training: readonly Message[];
  message: string;
  alpha: number;
  /** Words the learner switched off. */
  off: readonly string[];
}

function head(data: PythonData): string {
  return `# ${data.title}: the messages the model learns from
messages = [
${data.training.map((m) => `    (${pyString(m.text)}, ${pyString(m.label)}),`).join('\n')}
]
message = ${pyString(data.message)}  # the message from the Lab
alpha = ${pyNumber(data.alpha)}  # smoothing
off = [${data.off.map(pyString).join(', ')}]  # words switched off in the Lab`;
}

/** With scikit-learn: count the words, fit MultinomialNB, ask for P(spam). */
export function sklearnPython(data: PythonData): string {
  return `from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB

${head(data)}

# Count the words of every message: lower-case words of 2 or more letters
vectorizer = CountVectorizer()
counts = vectorizer.fit_transform([text for text, _ in messages])
model = MultinomialNB(alpha=alpha).fit(counts, [kind for _, kind in messages])

x = vectorizer.transform([message]).toarray()  # the message's known words
for word in off:
    if word in vectorizer.vocabulary_:
        x[0, vectorizer.vocabulary_[word]] = 0
spam = list(model.classes_).index("spam")
print(f"P(spam) = {model.predict_proba(x)[0, spam]:.1%}")
print(f"Verdict: {model.predict(x)[0]}")
`;
}

/** Plain Python, no libraries: counting, the chances and the evidence. */
export function plainPython(data: PythonData): string {
  return `import re
from math import exp, log

${head(data)}

def words(text):
    """Lower-case words of two or more letters or digits."""
    return re.findall(r"\\w\\w+", text.lower())

# Learn: count every word in each kind of message
counts = {"spam": {}, "normal": {}}
totals = {"spam": 0, "normal": 0}
sizes = {"spam": 0, "normal": 0}
for text, kind in messages:
    sizes[kind] += 1
    for word in words(text):
        counts[kind][word] = counts[kind].get(word, 0) + 1
        totals[kind] += 1
vocabulary = set(counts["spam"]) | set(counts["normal"])

def chance(word, kind):
    """P(word | kind) = (count + α) ÷ (all words of that kind + α × V)."""
    count = counts[kind].get(word, 0)
    return (count + alpha) / (totals[kind] + alpha * len(vocabulary))

# Read: start from the share of spam, then add each word's evidence
L = log(sizes["spam"] / sizes["normal"])
print(f"start: {L:+.2f}")
for word in words(message):
    if word not in vocabulary:
        print(f"{word}: never seen, skipped")
    elif word in off:
        print(f"{word}: switched off")
    else:
        evidence = log(chance(word, "spam") / chance(word, "normal"))
        L += evidence
        print(f"{word}: {evidence:+.2f}")
print(f"L = {L:+.2f}")
print(f"P(spam) = 1 ÷ (1 + e^(−L)) = {1 / (1 + exp(-L)):.1%}")
`;
}
