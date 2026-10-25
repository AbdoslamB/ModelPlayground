/**
 * The Python versions of the Lab, as text. They start from the Lab's people
 * and stands, so the numbers they print are the numbers the Lab shows after
 * Run. python.test.ts runs them and checks that.
 */
import type { Point } from './math';

import { pyNumber } from '../../lib/pycode';

export interface PythonData {
  title: string;
  people: readonly Point[];
  /** The stands where they are in the Lab now. */
  stands: readonly Point[];
}

const pair = (p: Point, open = '(', close = ')') =>
  `${open}${pyNumber(p.x)}, ${pyNumber(p.y)}${close}`;

/** With scikit-learn: KMeans from the Lab's stands, until nothing moves. */
export function sklearnPython(data: PythonData): string {
  return `import numpy as np
from sklearn.cluster import KMeans

# ${data.title}: where each person stands, east and north, in metres
people = np.array([
${data.people.map((p) => `    ${pair(p, '[', ']')},`).join('\n')}
])
stands = np.array([${data.stands.map((s) => pair(s, '[', ']')).join(', ')}])  # from the Lab

# Start from the Lab's stands (n_init=1) and stop only when nothing moves (tol=0)
model = KMeans(n_clusters=len(stands), init=stands, n_init=1, tol=0).fit(people)

for name, (east, north) in zip("ABCD", model.cluster_centers_):
    print(f"Stand {name}: {east:.1f} m east, {north:.1f} m north")
J = model.inertia_  # the total of every walk, squared
print(f"J = {J:.0f} m², typical walk {np.sqrt(J / len(people)):.1f} m")
`;
}

/** Plain Python, no libraries: the k-Means loop by hand. */
export function plainPython(data: PythonData): string {
  return `# ${data.title}: where each person stands (east, north), in metres
people = [
${data.people.map((p) => `    ${pair(p)},`).join('\n')}
]
stands = [${data.stands.map((s) => pair(s)).join(', ')}]  # from the Lab

def squared(a, b):
    """Squared straight-line distance."""
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

def nearest(person, stands):
    """The number of the nearest stand (the first one on a tie)."""
    return min(range(len(stands)), key=lambda j: squared(person, stands[j]))

def total(stands):
    """J: every person's walk to their nearest stand, squared, added up."""
    return sum(squared(p, stands[nearest(p, stands)]) for p in people)

J = total(stands)
print(f"Now: J = {J:.0f} m², typical walk {(J / len(people)) ** 0.5:.1f} m")

# k-Means: everyone walks to the nearest stand, then every stand moves to the
# middle of its people. Repeat until no stand moves.
for step in range(100):
    groups = [[] for _ in stands]
    for person in people:
        groups[nearest(person, stands)].append(person)
    moved = [
        (sum(p[0] for p in group) / len(group), sum(p[1] for p in group) / len(group))
        if group else stand  # a stand nobody walks to stays where it is
        for group, stand in zip(groups, stands)
    ]
    if moved == stands:
        break
    stands = moved

print(f"Settled after {step} steps")
for name, (east, north) in zip("ABCD", stands):
    print(f"Stand {name}: {east:.1f} m east, {north:.1f} m north")
J = total(stands)
print(f"J = {J:.0f} m², typical walk {(J / len(people)) ** 0.5:.1f} m")
`;
}
