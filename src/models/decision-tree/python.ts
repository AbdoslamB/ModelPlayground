/**
 * The Python versions of the Lab, as text. They use the Lab's days, depth
 * and the questions moved by hand, so the tree they print is the tree the
 * Lab draws. python.test.ts runs them and checks that.
 */
import type { Row, Split } from './math';

import { pyNumber, pyString } from '../../lib/pycode';

export interface PythonData {
  title: string;
  rows: readonly Row[];
  /** The classes, in the Lab's order (ties go to the first). */
  classes: readonly string[];
  /** Names for x and y, e.g. "temperature" and "wind". */
  names: readonly [string, string];
  units: readonly [string, string];
  depth: number;
  /** Questions moved by hand, by node path. */
  chosen: Readonly<Record<string, Split>>;
}

function head(data: PythonData, kinds: 'inline' | 'list'): string {
  const [x, y] = data.names;
  const [ux, uy] = data.units;
  const days =
    kinds === 'inline'
      ? data.rows.map(
          (r) =>
            `    (${pyNumber(r.x)}, ${pyNumber(r.y)}, ${pyString(r.label)}),`,
        )
      : data.rows.map((r) => `    [${pyNumber(r.x)}, ${pyNumber(r.y)}],`);
  return `# ${data.title}: ${x} (${ux}) and ${y} (${uy})${kinds === 'inline' ? ' and the kind of each day' : ''}
days = [
${days.join('\n')}
]`;
}

/** With scikit-learn: fit a tree, print it, count what it gets right. */
export function sklearnPython(data: PythonData): string {
  const moved = Object.keys(data.chosen).length > 0;
  return `from sklearn.tree import DecisionTreeClassifier, export_text

${head(data, 'list')}
kinds = [${data.rows.map((r) => pyString(r.label)).join(', ')}]
${
  moved
    ? `
# You moved questions by hand in the Lab. scikit-learn always picks the
# best question, so its tree can differ; Plain Python follows yours.
`
    : ''
}
model = DecisionTreeClassifier(max_depth=${data.depth}, random_state=0).fit(days, kinds)
print(export_text(model, feature_names=[${data.names.map(pyString).join(', ')}]))

right = sum(model.predict(days) == kinds)
print(f"Right on its own data: {right} of {len(days)}")
tree = model.tree_
leaf = tree.children_left == -1  # the nodes with no question
G = (tree.impurity[leaf] * tree.n_node_samples[leaf]).sum() / len(days)
print(f"All {leaf.sum()} leaves, weighted by size: G = {G:.2f}")
`;
}

/** Plain Python, no libraries: Gini, the best questions and the tree. */
export function plainPython(data: PythonData): string {
  const chosen = Object.entries(data.chosen)
    .sort(([a], [b]) => a.length - b.length || a.localeCompare(b))
    .map(
      ([path, s]) =>
        `${pyString(path)}: (${pyString(data.names[s.feature === 'x' ? 0 : 1])}, ${pyNumber(s.threshold)})`,
    );
  return `${head(data, 'inline')}
features = [${data.names.map(pyString).join(', ')}]
kinds = [${data.classes.map(pyString).join(', ')}]
max_depth = ${data.depth}
# Questions you moved by hand in the Lab, by place: "" is the top question,
# then L for its "yes" side and R for its "no" side.
chosen = {${chosen.join(', ')}}

def gini(rows):
    """1 − Σ pₖ²: 0 when every day is the same kind."""
    if not rows:
        return 0
    return 1 - sum((sum(r[2] == k for r in rows) / len(rows)) ** 2 for k in kinds)

def split(rows, f, t):
    """The days with feature f ≤ t ("yes"), and the rest ("no")."""
    return [r for r in rows if r[f] <= t], [r for r in rows if r[f] > t]

def gain(rows, f, t):
    """How much the question lowers Gini, each side weighted by its size."""
    yes, no = split(rows, f, t)
    return gini(rows) - (len(yes) * gini(yes) + len(no) * gini(no)) / len(rows)

def best_question(rows):
    """Try halfway between neighbouring values of each feature; keep the best."""
    best = None
    for f in range(len(features)):
        values = sorted(set(r[f] for r in rows))
        for low, high in zip(values, values[1:]):
            t = (low + high) / 2
            g = gain(rows, f, t)
            if best is None or g > best[2] + 1e-12:
                best = (f, t, g)
    return best

leaves = []

def grow(rows, path="", fallback=kinds[0], says=""):
    """A leaf (a kind), or a question with a "yes" and a "no" branch."""
    counts = [sum(r[2] == k for r in rows) for k in kinds]
    kind = kinds[counts.index(max(counts))] if rows else fallback
    pad = "  " * len(path) + says
    question = None
    if len(path) < max_depth and gini(rows) > 0:
        if path in chosen:
            name, t = chosen[path]
            question = (features.index(name), t)
        else:
            best = best_question(rows)
            question = best[:2] if best else None
    if question is None:
        leaves.append((len(rows), gini(rows)))
        print(f"{pad}{kind} ({len(rows)} days, G = {gini(rows):.2f})")
        return kind
    f, t = question
    print(f"{pad}{features[f]} ≤ {t:g}? ({len(rows)} days, gain {gain(rows, f, t):.2f})")
    yes, no = split(rows, f, t)
    return (f, t, grow(yes, path + "L", kind, "yes: "), grow(no, path + "R", kind, "no: "))

def predict(tree, day):
    """Answer the questions from the top until a leaf."""
    while isinstance(tree, tuple):
        f, t, yes, no = tree
        tree = yes if day[f] <= t else no
    return tree

tree = grow(days)
right = sum(predict(tree, day) == day[2] for day in days)
print(f"Right on its own data: {right} of {len(days)}")
G = sum(n * g for n, g in leaves) / len(days)
print(f"All {len(leaves)} leaves, weighted by size: G = {G:.2f}")
`;
}
