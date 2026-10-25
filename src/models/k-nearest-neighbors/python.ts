/**
 * The Python versions of the Lab, as text. They use the Lab's fruits, new
 * fruit and k, so the numbers they print are the numbers the Lab shows.
 * python.test.ts runs them and checks that.
 */
import type { Point } from './math';

import { pyNumber, pyString } from '../../lib/pycode';

export interface PythonData {
  title: string;
  /** The fruits in id order: id = position + 1. */
  rows: readonly { id: number; label: string; x: number; y: number }[];
  query: Point;
  k: number;
}

const point = (p: Point) => `${pyNumber(p.x)}, ${pyNumber(p.y)}`;

/** With scikit-learn: fit, ask for the nearest fruits, vote, score. */
export function sklearnPython(data: PythonData): string {
  return `from sklearn.model_selection import LeaveOneOut, cross_val_score
from sklearn.neighbors import KNeighborsClassifier

# ${data.title}: width and height of each fruit, in cm
fruits = [
${data.rows.map((r) => `    [${point(r)}],`).join('\n')}
]
kinds = [${data.rows.map((r) => pyString(r.label)).join(', ')}]
new_fruit = [${point(data.query)}]  # the new fruit from the Lab
k = ${data.k}

model = KNeighborsClassifier(n_neighbors=k).fit(fruits, kinds)
distances, nearest = model.kneighbors([new_fruit])
for d, i in zip(distances[0], nearest[0]):
    print(f"{kinds[i]} {i + 1}: {d:.2f} cm away")  # fruits are numbered from 1
print(f"The {k} nearest vote: {model.predict([new_fruit])[0]}")

# Hide each fruit in turn, and let its neighbours guess it
scores = cross_val_score(
    KNeighborsClassifier(n_neighbors=k), fruits, kinds, cv=LeaveOneOut()
)
print(f"Right on its own data: {scores.sum():.0f} of {len(kinds)}")
`;
}

/** Plain Python, no libraries: distances, sorting and the vote by hand. */
export function plainPython(data: PythonData): string {
  return `from math import sqrt

# ${data.title}: number, width (cm), height (cm) and kind of each fruit
fruits = [
${data.rows.map((r) => `    (${r.id}, ${point(r)}, ${pyString(r.label)}),`).join('\n')}
]
new_fruit = (${point(data.query)})  # the new fruit from the Lab
k = ${data.k}

def distance(fruit, point):
    """Straight-line distance: √((width − q₁)² + (height − q₂)²)."""
    _, width, height, _ = fruit
    return sqrt((width - point[0]) ** 2 + (height - point[1]) ** 2)

def classify(fruits, point, k):
    """The k nearest fruits vote with their kind; the most votes wins."""
    nearest = sorted(fruits, key=lambda fruit: distance(fruit, point))[:k]
    votes = {}
    for fruit in nearest:
        kind = fruit[3]
        votes[kind] = votes.get(kind, 0) + 1
    return max(votes, key=votes.get), nearest, votes

kind, nearest, votes = classify(fruits, new_fruit, k)
for fruit in nearest:
    print(f"{fruit[3]} {fruit[0]}: {distance(fruit, new_fruit):.2f} cm away")
print(f"The {k} nearest vote: {votes} → {kind}")

# Hide each fruit in turn, and let the others guess it
right = 0
for fruit in fruits:
    others = [other for other in fruits if other is not fruit]
    guess = classify(others, fruit[1:3], k)[0]
    right += guess == fruit[3]
print(f"Right on its own data: {right} of {len(fruits)}")
`;
}
