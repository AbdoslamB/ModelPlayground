/**
 * Runs the "Try it in Python" programs with this machine's Python, so each
 * model's python.test.ts can check they print the Lab's numbers. .pydeps
 * holds the data scripts' libraries (numpy, scikit-learn). Without a Python
 * (or a library) those tests are skipped.
 */
import { spawnSync } from 'node:child_process';

function findPython(): string | null {
  for (const command of ['python3', 'python']) {
    const probe = spawnSync(command, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return command;
  }
  return null;
}

export const python = findPython();

export function runPython(code: string): {
  error: string;
  ok: boolean;
  out: string;
} {
  if (!python) return { error: 'no python', ok: false, out: '' };
  const prelude = "import sys; sys.path.insert(0, '.pydeps')\n";
  const result = spawnSync(python, ['-c', prelude + code], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    timeout: 60_000,
  });
  return { error: result.stderr, ok: result.status === 0, out: result.stdout };
}

/** Whether this Python can import a library, e.g. "sklearn". */
export function hasModule(name: string): boolean {
  return python !== null && runPython(`import ${name}`).ok;
}

/** Every number in a line of output, in order. */
export function numbers(line: string | undefined): number[] {
  return (line?.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

/** The output's lines, without the trailing newline (Windows' \r too). */
export function lines(out: string): string[] {
  return out.trimEnd().split(/\r?\n/);
}
