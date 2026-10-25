/**
 * Wraps a handler so it runs at most once per animation frame, with the
 * latest arguments. Pointer and slider input go through this, so the state
 * is written once per frame however fast events arrive.
 *
 * Call flush() when a drag ends: it runs a waiting call now, so a quick
 * drag that ends within one frame still lands where the pointer let go.
 */
export function oncePerFrame<A extends unknown[]>(
  handler: (...args: A) => void,
): ((...args: A) => void) & { flush(): void } {
  let frame = 0;
  let latest: A | undefined;
  const run = (...args: A) => {
    latest = args;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (latest) handler(...latest);
    });
  };
  run.flush = () => {
    if (!frame) return;
    cancelAnimationFrame(frame);
    frame = 0;
    if (latest) handler(...latest);
  };
  return run;
}
