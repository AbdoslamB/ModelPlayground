/**
 * Wraps a handler so it runs at most once per animation frame, with the
 * latest arguments. Pointer and slider input go through this, so the state
 * is written once per frame however fast events arrive.
 */
export function oncePerFrame<A extends unknown[]>(
  handler: (...args: A) => void,
): ((...args: A) => void) & { cancel(): void } {
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
  run.cancel = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  return run;
}
