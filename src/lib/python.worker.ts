/**
 * Runs Python in the browser with Pyodide, in a worker so the page never
 * freezes. Pyodide is fetched from the CDN on the first run only; after that
 * the browser keeps it. Packages a snippet imports (numpy, scikit-learn) are
 * loaded when first needed.
 */

export const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';

interface Pyodide {
  loadPackagesFromImports(
    code: string,
    options?: { messageCallback?: (message: string) => void },
  ): Promise<unknown>;
  runPythonAsync(code: string): Promise<unknown>;
  setStdout(options: { batched: (text: string) => void }): void;
  setStderr(options: { batched: (text: string) => void }): void;
}

export interface Request {
  id: number;
  code: string;
}
export type Reply =
  | { id: number; kind: 'status'; text: string }
  | { id: number; kind: 'done'; output: string; error: string | null };

let ready: Promise<Pyodide> | null = null;

async function load(): Promise<Pyodide> {
  const module = (await import(
    /* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`
  )) as {
    loadPyodide: (options: { indexURL: string }) => Promise<Pyodide>;
  };
  return module.loadPyodide({ indexURL: PYODIDE_URL });
}

/** The part of a traceback about the learner's own code. */
function shorten(message: string): string {
  const lines = message.trim().split('\n');
  const start = lines.findIndex((l) => l.includes('File "<exec>"'));
  return (start === -1 ? lines.slice(-3) : lines.slice(start)).join('\n');
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, code } = event.data;
  const say = (text: string) => {
    self.postMessage({ id, kind: 'status', text } satisfies Reply);
  };
  const output: string[] = [];
  try {
    if (!ready) {
      say('Loading Python…');
      ready = load();
    }
    const py = await ready;
    if (/^\s*(from|import)\s+(sklearn|numpy|scipy|pandas)/m.test(code)) {
      say('Loading libraries…');
    }
    // Pyodide's own loading messages stay out of the learner's output.
    await py.loadPackagesFromImports(code, {
      messageCallback: () => undefined,
    });
    py.setStdout({ batched: (text) => output.push(text) });
    py.setStderr({ batched: (text) => output.push(text) });
    say('Running…');
    await py.runPythonAsync(code);
    self.postMessage({
      id,
      kind: 'done',
      output: output.join('\n'),
      error: null,
    } satisfies Reply);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!ready || message.includes('Failed to fetch')) ready = null;
    self.postMessage({
      id,
      kind: 'done',
      output: output.join('\n'),
      error: shorten(message),
    } satisfies Reply);
  }
};
