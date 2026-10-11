import { Cause, Effect } from '@tuturuuu/utils/effect';
import { StaffReadError } from './staff-access';

export interface StaffOperationContext {
  readonly signal: AbortSignal;
  check(): void;
  onStop(cleanup: () => void | Promise<void>): () => void;
  resource<T>(close: (value: T) => void | Promise<void>): (value: T) => void;
}
export interface StaffOperationPolicy {
  readonly durationMs: number;
  readonly scope: 'staff-list-detail-handler';
  readonly provenance: string;
}
export interface StaffOperationRuntime {
  now(): number;
  schedule(callback: () => void, delayMs: number): () => void;
}
const runtime: StaffOperationRuntime = {
  now: () => performance.now(),
  schedule: (callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
};
const unavailable = () => new StaffReadError(503);
interface CleanupSlot {
  active: boolean;
  done: boolean;
  start(): Promise<void>;
}

/** Cooperative invocation ownership only; no SDK/HTTP/PG closure claim. */
export class StaffOperation implements StaffOperationContext {
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private last: number;
  private stopped = false;
  private sealed = false;
  private retired = false;
  private cleanupFailed = false;
  private cancelTimer: (() => void) | undefined;
  private readonly slots: CleanupSlot[] = [];
  private readonly phaseReleases = new Set<() => void>();
  private readonly incomingAbort = () => this.stop();

  constructor(
    private readonly request: Request,
    readonly cutoff: number,
    origin: number,
    private readonly clock: StaffOperationRuntime
  ) {
    this.last = origin;
    request.signal.addEventListener('abort', this.incomingAbort, {
      once: true,
    });
    try {
      this.check();
      this.arm();
    } catch {
      this.stop();
    }
  }
  check = () => {
    if (this.stopped) throw unavailable();
    let now: number;
    try {
      now = this.clock.now();
    } catch {
      this.stop();
      throw unavailable();
    }
    if (
      !Number.isFinite(now) ||
      now < this.last ||
      now >= this.cutoff ||
      this.request.signal.aborted
    ) {
      this.stop();
      throw unavailable();
    }
    this.last = now;
  };
  private arm() {
    this.cancelTimer = this.clock.schedule(
      () => {
        this.cancelTimer = undefined;
        try {
          this.check();
          this.arm();
        } catch {
          this.stop();
        }
      },
      Math.min(this.cutoff - this.last, 2147483647)
    );
  }
  private seal() {
    this.sealed = true;
    for (const slot of this.slots) if (slot.active) void slot.start();
  }
  private stop() {
    if (this.stopped || this.retired) return;
    this.stopped = true;
    this.seal();
    try {
      this.controller.abort();
    } catch {
      this.cleanupFailed = true;
    }
  }
  onStop = (cleanup: () => void | Promise<void>) => {
    let ack: Promise<void> | undefined;
    const slot: CleanupSlot = {
      active: true,
      done: false,
      start: () => {
        if (ack) return ack;
        let complete!: () => void;
        // Install the acknowledgement before invoking potentially reentrant code.
        ack = new Promise<void>((resolve) => {
          complete = resolve;
        });
        const finish = () => {
          slot.done = true;
          complete();
        };
        const fail = () => {
          this.cleanupFailed = true;
          finish();
        };
        try {
          Promise.resolve(cleanup()).then(finish, fail);
        } catch {
          fail();
        }
        return ack;
      },
    };
    this.slots.push(slot);
    if (this.sealed) void slot.start();
    return () => {
      if (!this.sealed) slot.active = false;
    };
  };
  resource = <T>(close: (value: T) => void | Promise<void>) => {
    let assigned = false;
    let assign!: (value: T) => void;
    const allocation = new Promise<T>((resolve) => {
      assign = resolve;
    });
    // The sealed slot waits for allocation and acknowledges its once-only close.
    this.onStop(() => allocation.then(close));
    return (value: T) => {
      if (assigned) throw unavailable();
      assigned = true;
      assign(value);
    };
  };
  phase<T>(callback: (operation: StaffOperationContext) => Promise<T>) {
    return Effect.tryPromise({
      try: async (phaseSignal: AbortSignal) => {
        const abort = () => this.stop();
        const release = () => {
          phaseSignal.removeEventListener('abort', abort);
          this.phaseReleases.delete(release);
        };
        this.phaseReleases.add(release);
        phaseSignal.addEventListener('abort', abort, { once: true });
        try {
          if (phaseSignal.aborted) this.stop();
          this.check();
          const value = await callback(this);
          this.check();
          return value;
        } catch (error) {
          this.check();
          throw error;
        } finally {
          release();
        }
      },
      catch: (error) =>
        error instanceof StaffReadError ? error : unavailable(),
    });
  }
  private async barrier() {
    this.check();
    this.seal();
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      if (slot.active) await slot.start();
      this.check();
    }
    if (this.cleanupFailed) throw unavailable();
  }
  private retire() {
    this.seal();
    const release = (callback: () => void) => {
      try {
        callback();
      } catch {
        this.cleanupFailed = true;
      }
    };
    release(() =>
      this.request.signal.removeEventListener('abort', this.incomingAbort)
    );
    for (const callback of this.phaseReleases) release(callback);
    if (this.cancelTimer) release(this.cancelTimer);
    this.cancelTimer = undefined;
    // Retiring the Effect runtime's once listener is not an operation stop.
    this.retired = true;
    release(() => this.controller.abort());
  }
  async run<T>(
    program: Effect.Effect<T, StaffReadError>,
    publish: (value: T) => Response,
    failure: (status: number) => Response
  ): Promise<Response> {
    let response: Response;
    try {
      this.check();
      const staged = Effect.matchCause(program, {
        onSuccess: (value) => ({ ok: true as const, value }),
        onFailure: (cause) => ({
          ok: false as const,
          status:
            Cause.isFailType(cause) && cause.error instanceof StaffReadError
              ? cause.error.status
              : 503,
        }),
      }).pipe(
        Effect.flatMap((result) =>
          this.phase(async (_operation) => {
            await this.barrier();
            return result;
          })
        )
      );
      const exit = await Effect.runPromiseExit(staged, { signal: this.signal });
      this.check();
      if (exit._tag === 'Failure') response = failure(503);
      else if (exit.value.ok) response = publish(exit.value.value);
      else response = failure(exit.value.status);
      this.check();
      this.retire();
      if (
        this.cleanupFailed ||
        this.slots.some((slot) => slot.active && !slot.done)
      )
        throw unavailable();
      this.check();
      return response;
    } catch {
      this.stop();
      try {
        this.retire();
      } catch {
        /* Secondary failure never replaces safe output. */
      }
      return failure(503);
    }
  }
}
export function openStaffOperation(
  request: Request,
  policy: StaffOperationPolicy,
  clock: StaffOperationRuntime = runtime
): StaffOperation | null {
  // The sole origin precedes controller/listener/timer/Auth/parser allocation.
  try {
    const origin = clock.now();
    if (
      request.signal.aborted ||
      !Number.isFinite(origin) ||
      !policy ||
      !Number.isFinite(policy.durationMs) ||
      policy.durationMs <= 0 ||
      policy.scope !== 'staff-list-detail-handler' ||
      typeof policy.provenance !== 'string' ||
      !policy.provenance.trim()
    )
      return null;
    const cutoff = origin + policy.durationMs;
    if (!Number.isFinite(cutoff) || cutoff <= origin) return null;
    return new StaffOperation(request, cutoff, origin, clock);
  } catch {
    return null;
  }
}
