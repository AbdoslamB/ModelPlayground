/**
 * The Python versions of the Lab, as text. They run the Lab's trained
 * network (the same rounded weights) on the Lab's text and temperature, so
 * the chances they print are the Lab's. python.test.ts runs them and checks.
 */
import type { Weights } from './math';

import { pyList, pyNumber, pyString } from '../../lib/pycode';

export interface PythonData {
  title: string;
  question: string;
  text: string;
  temperature: number;
  alphabet: string;
  weights: Weights;
  maxSteps: number;
}

function matrix(rows: readonly (readonly number[])[], numpy: boolean): string {
  const open = numpy ? 'np.array([' : '[';
  const close = numpy ? '])' : ']';
  return `${open}\n${rows.map((r) => `    ${pyList(r, 4)},`).join('\n')}\n${close}`;
}

function weights(W: Weights, numpy: boolean): string {
  const vector = (v: readonly number[]) =>
    numpy ? `np.array(${pyList(v, 4)})` : pyList(v, 4);
  return `# The trained weights (python/recurrent_neural_network.py, rounded to 4 decimals)
Wx = ${matrix(W.Wx, numpy)}  # input: one column per character
Wh = ${matrix(W.Wh, numpy)}  # memory: from the last hidden state to the new one
b = ${vector(W.b)}
Wy = ${matrix(W.Wy, numpy)}  # output: one score per character
c = ${vector(W.c)}`;
}

function head(data: PythonData): string {
  return `# ${data.title}: ${data.question.toLowerCase()}
text = ${pyString(data.text)}  # the text from the Lab
T = ${pyNumber(data.temperature)}  # temperature: low sharpens the chances, high flattens them
alphabet = ${pyString(data.alphabet)}  # the characters the network knows
max_steps = ${data.maxSteps}

def show(char):
    """Spaces shown as ␣, so they can be seen."""
    return "␣" if char == " " else char

def percent(p):
    return f"{100 * p:.1f}%" if p < 0.01 else f"{100 * p:.0f}%"`;
}

const report = `steps = read(text)
if not steps:
    print("Type something for the network to read.")
for t, (char, p) in enumerate(steps, 1):
    best = sorted(range(len(alphabet)), key=lambda i: -p[i])[:3]  # ties: alphabet order
    print(f"{t:2} {show(char)} → " + ", ".join(f"{show(alphabet[i])} {percent(p[i])}" for i in best))

# How surprised was it by each character that really came next? (in bits)
bits = [-log2(p[alphabet.index(nxt)]) for (_, p), (nxt, _) in zip(steps, steps[1:])]
if bits:
    print(f"Surprise per character: {sum(bits) / len(bits):.1f} bits "
          f"(a blind guess: {log2(len(alphabet)):.1f})")`;

/** With NumPy: the weights are arrays, each step two matrix products. */
export function numpyPython(data: PythonData): string {
  return `from math import log2

import numpy as np

${head(data)}

def softmax(z, T):
    """Scores to chances that add up to 1: e^(z / T), shared out."""
    e = np.exp((z - z.max()) / T)
    return e / e.sum()

def read(text):
    """Read the text one character at a time, from an empty memory."""
    h = np.zeros(len(b))
    steps = []
    for char in text.lower():
        if char not in alphabet or len(steps) == max_steps:
            continue  # characters it never learned are skipped
        x = alphabet.index(char)
        h = np.tanh(Wx[:, x] + Wh @ h + b)  # hₜ = tanh(Wₓ xₜ + Wₕ hₜ₋₁ + b)
        z = Wy @ h + c  # a score for every character that could come next
        steps.append((char, softmax(z, T)))
    return steps

${weights(data.weights, true)}

${report}
`;
}

/** Plain Python, no libraries: the same sums, written out. */
export function plainPython(data: PythonData): string {
  return `from math import exp, log2, tanh

${head(data)}

def softmax(z, T):
    """Scores to chances that add up to 1: e^(z / T), shared out."""
    top = max(z)
    e = [exp((v - top) / T) for v in z]
    return [v / sum(e) for v in e]

def read(text):
    """Read the text one character at a time, from an empty memory."""
    h = [0.0] * len(b)
    steps = []
    for char in text.lower():
        if char not in alphabet or len(steps) == max_steps:
            continue  # characters it never learned are skipped
        x = alphabet.index(char)
        # hₜ = tanh(Wₓ xₜ + Wₕ hₜ₋₁ + b): the memory after this character
        h = [tanh(Wx[r][x] + sum(w * v for w, v in zip(Wh[r], h)) + b[r])
             for r in range(len(b))]
        # A score for every character that could come next
        z = [sum(w * v for w, v in zip(Wy[r], h)) + c[r] for r in range(len(c))]
        steps.append((char, softmax(z, T)))
    return steps

${weights(data.weights, false)}

${report}
`;
}
