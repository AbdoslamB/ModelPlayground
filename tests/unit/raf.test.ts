import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { oncePerFrame } from '../../src/lib/raf';

// A fake animation-frame clock: frames run only when the test says so.
let frames = new Map<number, FrameRequestCallback>();
let next = 1;

beforeEach(() => {
  frames = new Map();
  next = 1;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(next, callback);
    return next++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function runFrame() {
  const waiting = [...frames.values()];
  frames.clear();
  waiting.forEach((callback) => {
    callback(0);
  });
}

describe('oncePerFrame', () => {
  it('runs once per frame, with the latest arguments', () => {
    const calls: number[] = [];
    const run = oncePerFrame((n: number) => calls.push(n));
    run(1);
    run(2);
    run(3);
    expect(calls).toEqual([]);
    runFrame();
    expect(calls).toEqual([3]);
  });

  it('flush runs a waiting call now, and only once', () => {
    const calls: number[] = [];
    const run = oncePerFrame((n: number) => calls.push(n));
    run(1);
    run(2);
    run.flush();
    expect(calls).toEqual([2]);
    runFrame();
    expect(calls).toEqual([2]);
  });

  it('flush does nothing when no call is waiting', () => {
    const calls: number[] = [];
    const run = oncePerFrame((n: number) => calls.push(n));
    run(1);
    runFrame();
    run.flush();
    expect(calls).toEqual([1]);
  });
});
