import { describe, expect, it } from 'vitest';
import { createDebouncedSingleFlight } from '../src/jobs/wake.js';

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createDebouncedSingleFlight — D18 mechanism (generic, no DB)', () => {
  it('coalesces any number of synchronous triggers into exactly one run', async () => {
    let calls = 0;
    const wake = createDebouncedSingleFlight(async () => {
      calls += 1;
    }, 0);

    wake.trigger();
    wake.trigger();
    wake.trigger();

    // Give the 0ms debounce timer + its microtasks a chance to run.
    await new Promise((r) => setTimeout(r, 20));

    expect(calls).toBe(1);
    expect(wake.runs).toBe(1);
  });

  it('a trigger while a run is in flight is never re-entered — fn is never called twice concurrently, and exactly one more run happens after', async () => {
    let concurrentCalls = 0;
    let maxConcurrent = 0;
    let totalCalls = 0;
    const first = deferred<void>();

    const wake = createDebouncedSingleFlight(async () => {
      concurrentCalls += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      totalCalls += 1;
      if (totalCalls === 1) {
        await first.promise; // hold the first run open
      }
      concurrentCalls -= 1;
    }, 0);

    wake.trigger();
    await new Promise((r) => setTimeout(r, 20)); // let the first run actually start (fn is now in flight)
    expect(wake.runs).toBe(1);

    // Multiple triggers while the first run is still in flight must coalesce into at most one more run.
    wake.trigger();
    wake.trigger();
    wake.trigger();
    expect(wake.runs).toBe(1); // no re-entry: still just the one in-flight run

    first.resolve();
    await new Promise((r) => setTimeout(r, 20)); // let the trailing run happen

    expect(maxConcurrent).toBe(1); // never two overlapping calls to fn
    expect(wake.runs).toBe(2); // the in-flight run, plus exactly one coalesced trailing run
  });

  it('runs sequentially, never overlapping, across several trigger-while-in-flight cycles', async () => {
    const order: string[] = [];
    let active = 0;
    const wake = createDebouncedSingleFlight(async () => {
      active += 1;
      if (active > 1) order.push('OVERLAP');
      order.push('start');
      await new Promise((r) => setTimeout(r, 5));
      order.push('end');
      active -= 1;
    }, 0);

    wake.trigger();
    await new Promise((r) => setTimeout(r, 2));
    wake.trigger(); // lands while in flight -> queued as a trailing run
    await new Promise((r) => setTimeout(r, 30));

    expect(order).not.toContain('OVERLAP');
    expect(order.filter((e) => e === 'start')).toHaveLength(2);
  });
});
