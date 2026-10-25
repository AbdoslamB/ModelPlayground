/**
 * Runs a Python snippet in a worker (see python.worker.ts) and reports its
 * progress. Code that runs longer than the time limit is stopped: the
 * worker is thrown away, and the next run starts a fresh one.
 */
import type { Reply, Request } from './python.worker';

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
  limitSeconds = 10,
): Promise<PythonResult> {
  const id = nextId++;
  const current = getWorker();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: PythonResult) => {
      clearTimeout(timer);
      current.removeEventListener('message', listen);
      resolve(result);
    };
    function listen(event: MessageEvent<Reply>) {
      const reply = event.data;
      if (reply.id !== id) return;
      if (reply.kind === 'status') {
        onStatus(reply.text);
        // Only the code's own running time counts, not the download.
        if (reply.text === 'Running…') {
          timer = setTimeout(() => {
            current.terminate();
            if (worker === current) worker = null;
            finish({
              output: '',
              error: `Stopped after ${limitSeconds} seconds. Does the code loop forever?`,
            });
          }, limitSeconds * 1000);
        }
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
