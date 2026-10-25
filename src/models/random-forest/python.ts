/**
 * The Python versions of the Lab, as text. Plain Python uses the Lab's own
 * random numbers (mulberry32), so it grows the Lab's exact trees and prints
 * the Lab's votes; python.test.ts checks that. scikit-learn makes its own
 * random choices, so its trees can differ a little.
 */
import type { Row } from './math';

import { pyNumber, pyString } from '../../lib/pycode';

export interface PythonData {
  title: string;
  rows: readonly Row[];
  /** The classes, in the Lab's order (ties go to the first). */
  classes: readonly string[];
  /** Names for x and y, e.g. "soil temperature" and "water". */
  names: readonly [string, string];
  units: readonly [string, string];
  query: { x: number; y: number };
  size: number;
  forestSeed: number;
  maxDepth: number;
}

const pair = (p: { x: number; y: number }) =>
  `${pyNumber(p.x)}, ${pyNumber(p.y)}`;

/** With scikit-learn: a RandomForestClassifier and its trees' votes. */
export function sklearnPython(data: PythonData): string {
  const [x, y] = data.names;
  const [ux, uy] = data.units;
  return `from sklearn.ensemble import RandomForestClassifier

# ${data.title}: ${x} (${ux}) and ${y} (${uy})
seeds = [
${data.rows.map((r) => `    [${pair(r)}],`).join('\n')}
]
kinds = [${data.rows.map((r) => pyString(r.label)).join(', ')}]
new_seed = [${pair(data.query)}]  # the new seed from the Lab
T = ${data.size}  # trees in the forest

# Like the Lab: each tree draws its own seeds at random (with repeats) and
# asks at most ${data.maxDepth} questions, each on one feature picked at random.
# scikit-learn makes its own random choices, so its trees, and their votes,
# can differ a little from the Lab's. Plain Python grows the Lab's trees.
model = RandomForestClassifier(
    n_estimators=T, max_depth=${data.maxDepth}, max_features=1, random_state=${data.forestSeed}
).fit(seeds, kinds)

# Each tree votes; the most votes wins
votes = [model.classes_[int(tree.predict([new_seed])[0])] for tree in model.estimators_]
counts = ", ".join(f"{votes.count(kind)} {kind}" for kind in model.classes_)
print(f"T = {T} trees: {counts} → {max(model.classes_, key=votes.count)}")
`;
}

/** Plain Python, no libraries: the Lab's random numbers, trees and votes. */
export function plainPython(data: PythonData): string {
  const [x, y] = data.names;
  const [ux, uy] = data.units;
  return `# ${data.title}: ${x} (${ux}), ${y} (${uy}) and what each seed did
seeds = [
${data.rows.map((r) => `    (${pair(r)}, ${pyString(r.label)}),`).join('\n')}
]
kinds = [${data.classes.map(pyString).join(', ')}]
new_seed = (${pair(data.query)})  # the new seed from the Lab
T = ${data.size}  # trees in the forest
forest = ${data.forestSeed}  # New Forest in the Lab moves to the next number
max_depth = ${data.maxDepth}

def mulberry32(seed):
    """The Lab's random numbers: the same seed always gives the same ones."""
    state = seed
    def random():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (1 | state)) & 0xFFFFFFFF
        t = ((t + ((t ^ (t >> 7)) * (61 | t) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return random

def gini(rows):
    """1 − Σ pₖ²: 0 when every seed did the same."""
    if not rows:
        return 0
    return 1 - sum((sum(r[2] == k for r in rows) / len(rows)) ** 2 for k in kinds)

def best_threshold(rows, f):
    """Halfway between neighbouring values of feature f, with the best gain."""
    values = sorted(set(r[f] for r in rows))
    best, best_gain = None, None
    for low, high in zip(values, values[1:]):
        t = (low + high) / 2
        yes = [r for r in rows if r[f] <= t]
        no = [r for r in rows if r[f] > t]
        gain = gini(rows) - (len(yes) * gini(yes) + len(no) * gini(no)) / len(rows)
        if best is None or gain > best_gain + 1e-12:
            best, best_gain = t, gain
    return best

def grow(rows, random, depth=0):
    """A leaf (a kind), or a question on a feature picked at random."""
    counts = [sum(r[2] == k for r in rows) for k in kinds]
    kind = kinds[counts.index(max(counts))]
    if depth >= max_depth or gini(rows) == 0:
        return kind
    first = 0 if random() < 0.5 else 1
    for f in (first, 1 - first):  # the other feature if the first cannot split
        t = best_threshold(rows, f)
        if t is not None:
            yes = [r for r in rows if r[f] <= t]
            no = [r for r in rows if r[f] > t]
            return (f, t, grow(yes, random, depth + 1), grow(no, random, depth + 1))
    return kind

def make_tree(i):
    """Tree i draws len(seeds) seeds at random, with repeats, then grows."""
    random = mulberry32(forest * 1000 + i)
    drawn = [int(random() * len(seeds)) for _ in seeds]
    return drawn, grow([seeds[j] for j in drawn], random)

def predict(tree, point):
    """Answer the questions from the top until a leaf."""
    while isinstance(tree, tuple):
        f, t, yes, no = tree
        tree = yes if point[f] <= t else no
    return tree

trees = [make_tree(i) for i in range(T)]
votes = []
for i, (drawn, tree) in enumerate(trees):
    votes.append(predict(tree, new_seed))
    print(f"Tree {i + 1} saw {len(set(drawn))} different seeds and says {votes[-1]}")
counts = ", ".join(f"{votes.count(kind)} {kind}" for kind in kinds)
print(f"T = {T} trees: {counts} → {max(kinds, key=votes.count)}")

# Out of bag: each seed is judged only by the trees that never drew it
right = judged = 0
for i, seed in enumerate(seeds):
    unseen = [tree for drawn, tree in trees if i not in drawn]
    if unseen:
        judged += 1
        says = [predict(tree, seed) for tree in unseen]
        right += max(kinds, key=says.count) == seed[2]
print(f"Right on unseen seeds: {right} of {judged}")
`;
}
