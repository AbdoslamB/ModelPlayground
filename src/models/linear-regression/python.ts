/**
 * The Python versions of the Lab, as text. They use the Lab's current data
 * and line, so the numbers they print are the numbers the Lab shows.
 * python.test.ts runs them and checks that.
 */
import type { Line } from './math';

export interface PythonData {
  /** Names for the two lists, e.g. "age" and "height". */
  x: string;
  y: string;
  xUnit: string;
  yUnit: string;
  title: string;
  xs: readonly number[];
  ys: readonly number[];
  /** The x the page's question asks about, e.g. 4 weeks. */
  exampleX: number;
}

/** Python literal for a number: no trailing zeros, no "−". */
function literal(value: number): string {
  return String(Number(value.toFixed(6)));
}

function list(values: readonly number[]): string {
  return `[${values.map(literal).join(', ')}]`;
}

/** Plain Python, no libraries: the averages and the best line by hand. */
export function plainPython(data: PythonData, line: Line): string {
  const { x, y } = data;
  return `# ${data.title}: ${x} (${data.xUnit}) and ${y} (${data.yUnit})
${x} = ${list(data.xs)}
${y} = ${list(data.ys)}
n = len(${x})

# Your line from the Lab: ${y} = a + b × ${x}
a, b = ${literal(line.a)}, ${literal(line.b)}

def mse(a, b):
    """The mean squared error: the average of each miss, squared."""
    return sum((yi - (a + b * xi)) ** 2 for xi, yi in zip(${x}, ${y})) / n

# The best line: it passes through the averages, with this slope
mean_x = sum(${x}) / n
mean_y = sum(${y}) / n
b_best = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(${x}, ${y})) \\
    / sum((xi - mean_x) ** 2 for xi in ${x})
a_best = mean_y - b_best * mean_x

yours, best = mse(a, b), mse(a_best, b_best)
print(f"Your line: a = {a:.1f}, b = {b:.1f}, MSE = {yours:.1f}")
print(f"Best line: a = {a_best:.1f}, b = {b_best:.1f}, MSE = {best:.1f}")
print(f"Typical miss: yours {yours ** 0.5:.1f}, best {best ** 0.5:.1f} ${data.yUnit}")
print(f"At ${literal(data.exampleX)} ${data.xUnit}: {a_best + b_best * ${literal(data.exampleX)}:.1f} ${data.yUnit}")
`;
}

/** The same with scikit-learn: fit, read the line, measure the error. */
export function sklearnPython(data: PythonData): string {
  const { x, y } = data;
  return `from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error

# ${data.title}: ${x} (${data.xUnit}) and ${y} (${data.yUnit})
${x} = ${list(data.xs)}
${y} = ${list(data.ys)}
X = [[xi] for xi in ${x}]  # scikit-learn wants one row per measurement

model = LinearRegression().fit(X, ${y})
a, b = model.intercept_, model.coef_[0]
mse = mean_squared_error(${y}, model.predict(X))

print(f"Best line: a = {a:.1f}, b = {b:.1f}, MSE = {mse:.1f}")
print(f"Typical miss: {mse ** 0.5:.1f} ${data.yUnit}")
print(f"At ${literal(data.exampleX)} ${data.xUnit}: {model.predict([[${literal(data.exampleX)}]])[0]:.1f} ${data.yUnit}")
`;
}
