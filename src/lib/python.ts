/**
 * Runs a Python snippet in a worker (see python.worker.ts) and reports its
 * progress. There is no time limit: a run takes as long as the code needs,
 * and the page stays responsive meanwhile because Python runs in the worker.
 */
import type { Reply, Request } from './python.worker';

/** One tab of a model's "Try it in Python" section. */
export interface PythonProgram {
  id: string;
  /** The tab's name, e.g. "With scikit-learn". */
  label: string;
  /** The program, following the Lab's current state. */
  code: string;
}

export interface PythonResult {
  output: string;
  error: string | null;
}

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  worker ??= new Worker(new URL('./python.worker.ts', import.meta.url), {
    type: 'module',
  });
  return worker;
}

export function runPython(
  code: string,
  onStatus: (text: string) => void,
): Promise<PythonResult> {
  const id = nextId++;
  const current = getWorker();
  return new Promise((resolve) => {
    const finish = (result: PythonResult) => {
      current.removeEventListener('message', listen);
      resolve(result);
    };
    function listen(event: MessageEvent<Reply>) {
      const reply = event.data;
      if (reply.id !== id) return;
      if (reply.kind === 'status') {
        onStatus(reply.text);
        return;
      }
      finish({ output: reply.output, error: reply.error });
    }
    current.addEventListener('message', listen);
    current.addEventListener(
      'error',
      () => {
        finish({
          output: '',
          error: 'Python could not start. Check the connection and try again.',
        });
        if (worker === current) worker = null;
      },
      { once: true },
    );
    current.postMessage({ id, code } satisfies Request);
  });
}
