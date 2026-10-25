/**
 * The Python versions of the Lab, as text. "By hand" runs the Lab's t-SNE
 * with NumPy (plain Python would be too slow for 1000 steps in the browser):
 * the same start, perplexity search, cost, gradient and optimiser. It matches
 * the Lab exactly while the map is a tiny cloud; once it spreads out, tiny
 * rounding differences grow, so the last digits can differ a little.
 * python.test.ts checks both. scikit-learn's TSNE also stops by its own rules.
 */
import type { Map2D, Schedule } from './math';

import { pyNumber, pyString } from '../../lib/pycode';

export interface PythonData {
  title: string;
  pictures: readonly { id: number; kind: string; pixels: readonly number[] }[];
  /** What each kind is called, e.g. "bar across". */
  kindNames: Readonly<Record<string, string>>;
  start: Map2D;
  perplexity: number;
  /** How many optimiser steps the Lab has taken. */
  steps: number;
  schedule: Schedule;
  /** How many nearest neighbours are compared. */
  neighbours: number;
  /** The picture the Lab describes. */
  reference: number;
}

function head(data: PythonData): string {
  return `import numpy as np

# ${data.title}: ${data.pictures.length} pictures of 8 × 8 pixels (0 to 16), one per line
pictures = np.array([
${data.pictures.map((p) => `    [${p.pixels.join(', ')}],  # ${p.id}: ${data.kindNames[p.kind] ?? p.kind}`).join('\n')}
])
kinds = [${data.pictures.map((p) => pyString(data.kindNames[p.kind] ?? p.kind)).join(', ')}]
perplexity = ${pyNumber(data.perplexity)}  # roughly: how many neighbours each picture pays attention to
k = ${data.neighbours}  # nearest neighbours compared
n = len(pictures)

# Squared distances between every two pictures, pixel by pixel
D = ((pictures[:, None, :] - pictures[None, :, :]) ** 2).sum(axis=2).astype(float)

def nearest(distances):
    """Each picture's k nearest others, nearest first (ties by number)."""
    return [[j for j in np.argsort(row, kind="stable") if j != i][:k]
            for i, row in enumerate(distances)]`;
}

function tail(data: PythonData, map: string): string {
  const r = data.reference;
  return `# How many of each picture's k nearest in pixels are still nearest on the map?
on_map = ((${map}[:, None, :] - ${map}[None, :, :]) ** 2).sum(axis=2)
in_pixels, on_the_map = nearest(D), nearest(on_map)
kept = sum(len(set(a) & set(b)) for a, b in zip(in_pixels, on_the_map))
print(f"Neighbours kept: {kept} of {n * k} ({100 * kept / (n * k):.1f}%)")
near = [int(j) + 1 for j in in_pixels[${r}]]
still = sum(j in on_the_map[${r}] for j in in_pixels[${r}])
print(f"Picture ${r + 1} ({kinds[${r}]}): its {k} nearest in pixels are {near}; {still} of them are still nearest on the map")`;
}

/** With scikit-learn: TSNE from the Lab's start, exact method. */
export function sklearnPython(data: PythonData): string {
  const s = data.schedule;
  return `from sklearn.manifold import TSNE

${head(data)}
start = np.array([
${data.start.map(([x, y]) => `    [${pyNumber(x, 9)}, ${pyNumber(y, 9)}],`).join('\n')}
])  # where the Lab's map starts

# The Lab's settings. scikit-learn takes at least 250 steps and may stop early
# when the map stops changing, so its numbers can differ a little from the Lab's.
model = TSNE(
    perplexity=perplexity, early_exaggeration=${pyNumber(s.exaggeration)}, learning_rate=${pyNumber(s.learningRate)},
    max_iter=${Math.max(250, data.steps)}, init=start, method="exact",
)
Y = model.fit_transform(pictures)
print(f"KL(P ‖ Q) = {model.kl_divergence_:.3f} after {model.n_iter_} steps")

${tail(data, 'Y')}
`;
}

/** By hand with NumPy: the Lab's exact t-SNE, step by step. */
export function numpyPython(data: PythonData): string {
  const s = data.schedule;
  return `${head(data)}
Y = np.array([
${data.start.map(([x, y]) => `    [${pyNumber(x, 9)}, ${pyNumber(y, 9)}],`).join('\n')}
])  # where the Lab's map starts
steps = ${data.steps}  # how far the Lab has run
EPS = np.finfo(float).eps  # the smallest chance used, so logs stay finite

# p(j | i): each picture's neighbourhood width (precision β = 1 / 2σ²) is
# searched so that its perplexity is the one asked for
P = np.zeros((n, n))
beta = np.ones(n)
for i in range(n):
    d = D[i] - np.delete(D[i], i).min()  # measured from the nearest picture
    d[i] = 0  # a picture is not its own neighbour: its chance is set to 0
    lo, hi = -np.inf, np.inf
    for _ in range(100):
        row = np.exp(-d * beta[i])
        row[i] = 0
        total = row.sum()
        row = row / total
        diff = np.log(total) + beta[i] * (d * row).sum() - np.log(perplexity)
        if abs(diff) <= 1e-5:
            break
        if diff > 0:
            lo, beta[i] = beta[i], beta[i] * 2 if hi == np.inf else (beta[i] + hi) / 2
        else:
            hi, beta[i] = beta[i], beta[i] / 2 if lo == -np.inf else (beta[i] + lo) / 2
    P[i] = row
P = P + P.T
P = np.maximum(P / P.sum(), EPS)  # joint chances, adding up to 1
np.fill_diagonal(P, 0)

def cost_and_gradient(Y, P):
    """KL(P ‖ Q) = Σ p log(p / q), with q from a Student-t curve on the map."""
    diff = Y[:, None, :] - Y[None, :, :]
    w = 1 / (1 + (diff ** 2).sum(axis=2))
    np.fill_diagonal(w, 0)
    Q = np.maximum(w / w.sum(), EPS)
    cost = (P * np.log(np.maximum(P, EPS) / Q)).sum()
    gradient = 4 * (((P - Q) * w)[:, :, None] * diff).sum(axis=1)
    return cost, gradient

# The optimiser: gains grow while a coordinate keeps moving the same way, and
# each move keeps some momentum. For the first ${s.exaggeratedSteps} steps P counts ×${pyNumber(s.exaggeration)}.
update, gains = np.zeros_like(Y), np.ones_like(Y)
for t in range(steps):
    early = t < ${s.exaggeratedSteps}
    if t == ${s.exaggeratedSteps}:
        update, gains = np.zeros_like(Y), np.ones_like(Y)
    _, gradient = cost_and_gradient(Y, P * ${pyNumber(s.exaggeration)} if early else P)
    gains = np.maximum(0.01, np.where(update * gradient < 0, gains + 0.2, gains * 0.8))
    update = (${pyNumber(s.momentum[0])} if early else ${pyNumber(s.momentum[1])}) * update - ${pyNumber(s.learningRate)} * gradient * gains
    Y = Y + update

# Once the map spreads out, tiny rounding differences between Python and the
# browser grow, so the last digits can differ a little from the Lab's.
print(f"Step t = {steps}: KL(P ‖ Q) = {cost_and_gradient(Y, P)[0]:.3f}")
sigma = np.sqrt(1 / (2 * beta))
print(f"Picture ${data.reference + 1}'s neighbourhood: σ = {sigma[${data.reference}]:.1f}")

${tail(data, 'Y')}
`;
}
