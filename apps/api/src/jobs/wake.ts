/**
 * D18's mechanism, generic and dependency-free (no DB, no `runDueJobs`) so it is unit-testable on
 * its own with a synthetic `fn` (`wake.test.ts`) — `runner.ts` wires one instance of this to
 * `runDueJobs` with a 0ms debounce.
 *
 * Contract: `trigger()` called any number of times before `fn` actually starts coalesces into a
 * single call ("debounced"); `trigger()` called while a call to `fn` is already in flight never
 * starts a second, overlapping call ("single-flight") — instead it schedules exactly one more call
 * right after the in-flight one finishes, so a wake that arrives mid-pass is never lost, but two
 * calls to `fn` are never running at once.
 */
export type DebouncedSingleFlight = {
  trigger(): void;
  /** Test-only observability: how many times `fn` actually started. Never read outside a test. */
  readonly runs: number;
};

export function createDebouncedSingleFlight(
  fn: () => Promise<unknown>,
  delayMs = 0,
): DebouncedSingleFlight {
  let scheduled: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | null = null;
  let pending = false;
  let runs = 0;

  function startRun(): void {
    runs += 1;
    inFlight = fn()
      .catch((err) => {
        console.error('jobs wake-on-enqueue: a debounced pass failed:', err);
      })
      .then(() => {
        inFlight = null;
        if (pending) {
          pending = false;
          startRun();
        }
      });
  }

  function trigger(): void {
    if (inFlight) {
      // A pass is already running — never re-entered. Remember to run once more right after it
      // finishes, so this wake is not silently dropped.
      pending = true;
      return;
    }
    if (scheduled) return; // already debounced — coalesce into the pending timer
    scheduled = setTimeout(() => {
      scheduled = undefined;
      startRun();
    }, delayMs);
    scheduled.unref?.();
  }

  return {
    trigger,
    get runs() {
      return runs;
    },
  };
}
