/**
 * The Python versions of the Lab, as text. They use the Lab's students
 * (where they were dragged to), C and kernel, so the numbers they print are
 * the numbers the Lab shows. The best border is unique, so plain Python's
 * simpler solver finds the same one as libsvm. python.test.ts checks that.
 */
import type { Kernel, Point } from './math';

import { pyNumber } from '../../lib/pycode';

export interface PythonData {
  title: string;
  /** The students in id order: id = position + 1. */
  points: readonly Point[];
  /** +1 or −1 for each student. */
  signs: readonly number[];
  /** What +1 and −1 mean, e.g. "passed" and "failed". */
  plus: string;
  minus: string;
  /** Names for x and y, e.g. "studied" and "slept". */
  names: readonly [string, string];
  C: number;
  kernel: Kernel;
}

const pair = (p: Point) => `${pyNumber(p.x)}, ${pyNumber(p.y)}`;

/** With scikit-learn: SVC, the same solver (libsvm) as the Lab. */
export function sklearnPython(data: PythonData): string {
  const [x, y] = data.names;
  const linear = data.kernel.type === 'linear';
  const model = linear
    ? 'SVC(kernel="linear", C=C, tol=1e-9)'
    : `SVC(kernel="rbf", C=C, tol=1e-9, gamma=${pyNumber(data.kernel.type === 'rbf' ? data.kernel.gamma : 0)})`;
  return `import numpy as np
from sklearn.svm import SVC

# ${data.title}: hours ${x} and hours ${y} of each student
students = [
${data.points.map((p) => `    [${pair(p)}],`).join('\n')}
]
results = [${data.signs.join(', ')}]  # +1 ${data.plus}, −1 ${data.minus}
C = ${pyNumber(data.C)}  # how much each step inside the margin costs

# tol=1e-9: keep improving the border until it stops moving, as the Lab does
model = ${model}.fit(students, results)
f = model.decision_function(students)  # f(x) for every student

support = sorted(int(i) + 1 for i in model.support_)
print(f"Support vectors: {len(support)} of {len(students)}: students {support}")
${
  linear
    ? `w, b = model.coef_[0], model.intercept_[0]
print(f"f(x) = {w[0]:.2f} × ${x} {w[1]:+.2f} × ${y} {b:+.2f}")
norm = np.linalg.norm(w)
print(f"margin = 2 ÷ ‖w‖ = 2 ÷ {norm:.2f} = {2 / norm:.2f} h")
xi = np.maximum(0, 1 - np.array(results) * f).sum()  # every student's slack
size = w @ w / 2
print(f"½‖w‖² + C Σξ = {size:.2f} + {C:g} × {xi:.2f} = {size + C * xi:.2f}")`
    : `print(f"f(x) = Σ αᵢ yᵢ K(xᵢ, x) {model.intercept_[0]:+.2f}")`
}
wrong = int((np.array(results) * f < 0).sum())
print(f"On the wrong side of the border: {wrong} of {len(students)}")
`;
}

/** Plain Python, no libraries: the weights found two at a time (SMO). */
export function plainPython(data: PythonData): string {
  const [x, y] = data.names;
  const linear = data.kernel.type === 'linear';
  const kernel = linear
    ? `def K(a, b):
    """The kernel for a straight border: a · b."""
    return a[0] * b[0] + a[1] * b[1]`
    : `gamma = ${pyNumber(data.kernel.type === 'rbf' ? data.kernel.gamma : 0)}

def K(a, b):
    """The kernel for a curved border: e^(−γ‖a − b‖²)."""
    return exp(-gamma * ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2))`;
  return `from math import exp, sqrt

# ${data.title}: hours ${x}, hours ${y}, and +1 (${data.plus}) or −1 (${data.minus})
students = [
${data.points.map((p, i) => `    (${pair(p)}, ${data.signs[i] ?? 1}),`).join('\n')}
]
C = ${pyNumber(data.C)}  # how much each step inside the margin costs

${kernel}

points = [(a, b) for a, b, _ in students]
y = [sign for _, _, sign in students]
n = len(students)
Q = [[y[i] * y[j] * K(points[i], points[j]) for j in range(n)] for i in range(n)]

# Find one weight α per student (0 ≤ α ≤ C, with Σ αᵢyᵢ = 0) that makes
# ½ ΣΣ αᵢαⱼQᵢⱼ − Σ αᵢ as small as possible, two weights at a time.
alpha = [0.0] * n
G = [-1.0] * n  # how that sum changes with each weight
for step in range(100_000):
    up = [t for t in range(n) if (alpha[t] < C if y[t] > 0 else alpha[t] > 0)]
    down = [t for t in range(n) if (alpha[t] > 0 if y[t] > 0 else alpha[t] < C)]
    i = max(up, key=lambda t: -y[t] * G[t])
    j = min(down, key=lambda t: -y[t] * G[t])
    m, M = -y[i] * G[i], -y[j] * G[j]
    if m - M < 1e-9:
        break  # no pair of weights can make it smaller
    # Move the pair as far as helps, keeping every weight between 0 and C
    curve = max(Q[i][i] + Q[j][j] - 2 * y[i] * y[j] * Q[i][j], 1e-12)
    t = min((m - M) / curve, C - alpha[i] if y[i] > 0 else alpha[i],
            alpha[j] if y[j] > 0 else C - alpha[j])
    alpha[i] += y[i] * t
    alpha[j] -= y[j] * t
    for k in range(n):
        G[k] += (Q[k][i] * y[i] - Q[k][j] * y[j]) * t

# b: from the students exactly on their margin line (0 < α < C)
free = [t for t in range(n) if 0 < alpha[t] < C]
b = sum(-y[t] * G[t] for t in free) / len(free) if free else (m + M) / 2

def f(point):
    """f(x) = Σ αᵢ yᵢ K(xᵢ, x) + b: above 0 means ${data.plus}."""
    return sum(alpha[i] * y[i] * K(points[i], point) for i in range(n)) + b

support = [i + 1 for i in range(n) if alpha[i] > 1e-8]
print(f"Support vectors: {len(support)} of {n}: students {support}")
${
  linear
    ? `w = [sum(alpha[i] * y[i] * points[i][k] for i in range(n)) for k in (0, 1)]
print(f"f(x) = {w[0]:.2f} × ${x} {w[1]:+.2f} × ${y} {b:+.2f}")
norm = sqrt(w[0] ** 2 + w[1] ** 2)
print(f"margin = 2 ÷ ‖w‖ = 2 ÷ {norm:.2f} = {2 / norm:.2f} h")
xi = sum(max(0, 1 - y[i] * f(points[i])) for i in range(n))  # every slack
size = (w[0] ** 2 + w[1] ** 2) / 2
print(f"½‖w‖² + C Σξ = {size:.2f} + {C:g} × {xi:.2f} = {size + C * xi:.2f}")`
    : `print(f"f(x) = Σ αᵢ yᵢ K(xᵢ, x) {b:+.2f}")`
}
wrong = sum(y[i] * f(points[i]) < 0 for i in range(n))
print(f"On the wrong side of the border: {wrong} of {n}")
`;
}
