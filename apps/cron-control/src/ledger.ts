// Durable per-job schedule state. The Durable Object adapter persists it; this
// module holds the decisions so they can be tested without a Workers runtime.
// There are no alarms: only Cron Triggers start work, so a stopped or
// exhausted job can never reschedule itself.

export type RunOutcome = 'failed' | 'ok' | 'stopped' | 'unknown';

export interface JobState {
  consecutiveFailures: number;
  generation: number;
  lastCompletedAt: number | null;
  lastOutcome: RunOutcome | null;
  lastSlot: string | null;
  leaseUntil: number;
  runs: number;
  stopReason: string | null;
  stopped: boolean;
  /**
   * Durable follow-up work a run committed but has not finished (for example
   * storefront revalidation after checkout expiry); later runs retry it.
   */
  pendingWork?: string[];
}

export type ClaimResult =
  | { granted: true; generation: number }
  | { granted: false; reason: 'busy' | 'duplicate' | 'stopped' };

export interface ClaimInput {
  jobId: string;
  leaseMs: number;
  /** Budget charged when an abandoned claim is reconciled. */
  maxConsecutiveFailures: number;
  now: number;
  slot: string;
}

export interface CompleteInput {
  generation: number;
  jobId: string;
  maxConsecutiveFailures: number;
  now: number;
  outcome: RunOutcome;
  slot: string;
}

export interface Ledger {
  addPendingWork(jobId: string, items: string[]): Promise<void>;
  checkFence(jobId: string, generation: number): Promise<boolean>;
  pendingWork(jobId: string): Promise<string[]>;
  settlePendingWork(jobId: string, items: string[]): Promise<void>;
  claim(input: ClaimInput): Promise<ClaimResult>;
  complete(input: CompleteInput): Promise<JobState>;
  resume(jobId: string): Promise<JobState>;
  status(): Promise<Record<string, JobState>>;
  stop(jobId: string, reason: string): Promise<JobState>;
}

export interface LedgerStore {
  list(): [string, JobState][];
  read(jobId: string): JobState | null;
  write(jobId: string, state: JobState): void;
}

// Bounds one job's stored obligations; the oldest are dropped (and logged)
// only if a backlog ever exceeds it.
export const MAX_PENDING_WORK = 5_000;

export function initialJobState(): JobState {
  return {
    consecutiveFailures: 0,
    generation: 1,
    lastCompletedAt: null,
    lastOutcome: null,
    lastSlot: null,
    leaseUntil: 0,
    runs: 0,
    stopReason: null,
    stopped: false,
  };
}

export class LedgerCore {
  constructor(private readonly store: LedgerStore) {}

  #read(jobId: string) {
    return this.store.read(jobId) ?? initialJobState();
  }

  // Reads only, unless the claim is granted or an abandoned claim is
  // reconciled: idle, stopped and duplicate ticks write nothing.
  claim({
    jobId,
    leaseMs,
    maxConsecutiveFailures,
    now,
    slot,
  }: ClaimInput): ClaimResult {
    let state = this.#read(jobId);
    if (state.stopped) return { granted: false, reason: 'stopped' };
    if (state.lastSlot !== null && slot <= state.lastSlot)
      return { granted: false, reason: 'duplicate' };
    if (state.leaseUntil > now) return { granted: false, reason: 'busy' };
    // Completion always clears the lease, so an expired one belongs to a run
    // that was terminated before it reported. Charge that unknown outcome to
    // the durable budget before admitting a replacement, so repeated
    // terminations exhaust it like any other failure.
    if (state.leaseUntil !== 0) {
      state = this.#charge(state, 'unknown', maxConsecutiveFailures);
      if (state.stopped) {
        this.store.write(jobId, state);
        return { granted: false, reason: 'stopped' };
      }
    }
    this.store.write(jobId, {
      ...state,
      lastSlot: slot,
      leaseUntil: now + leaseMs,
      runs: state.runs + 1,
    });
    return { granted: true, generation: state.generation };
  }

  checkFence(jobId: string, generation: number) {
    const state = this.#read(jobId);
    return !state.stopped && state.generation === generation;
  }

  // Persistent failure exhausts a durable budget: the job stops until an
  // operator resumes it, and restarts do not reset the counter.
  complete({
    generation,
    jobId,
    maxConsecutiveFailures,
    now,
    outcome,
    slot,
  }: CompleteInput): JobState {
    const state = this.#read(jobId);
    if (
      state.leaseUntil === 0 ||
      state.lastSlot !== slot ||
      state.generation !== generation
    )
      return state;
    const next: JobState = {
      ...this.#charge(state, outcome, maxConsecutiveFailures),
      lastCompletedAt: outcome === 'ok' ? now : state.lastCompletedAt,
    };
    this.store.write(jobId, next);
    return next;
  }

  #charge(
    state: JobState,
    outcome: RunOutcome,
    maxConsecutiveFailures: number
  ): JobState {
    const failed = outcome === 'failed' || outcome === 'unknown';
    const consecutiveFailures = failed
      ? state.consecutiveFailures + 1
      : outcome === 'ok'
        ? 0
        : state.consecutiveFailures;
    const exhausted = consecutiveFailures >= maxConsecutiveFailures;
    return {
      ...state,
      consecutiveFailures,
      lastOutcome: outcome,
      leaseUntil: 0,
      stopReason:
        exhausted && !state.stopped
          ? 'failure-budget-exhausted'
          : state.stopReason,
      stopped: state.stopped || exhausted,
    };
  }

  stop(jobId: string, reason: string): JobState {
    const state = this.#read(jobId);
    const next = { ...state, stopReason: reason, stopped: true };
    this.store.write(jobId, next);
    return next;
  }

  // A new generation fences out completions and retries from before the stop.
  resume(jobId: string): JobState {
    const state = this.#read(jobId);
    const next = {
      ...state,
      consecutiveFailures: 0,
      generation: state.generation + 1,
      leaseUntil: 0,
      stopReason: null,
      stopped: false,
    };
    this.store.write(jobId, next);
    return next;
  }

  status(): Record<string, JobState> {
    return Object.fromEntries(this.store.list());
  }

  pendingWork(jobId: string): string[] {
    return this.#read(jobId).pendingWork ?? [];
  }

  addPendingWork(jobId: string, items: string[]) {
    const state = this.#read(jobId);
    const current = state.pendingWork ?? [];
    const merged = [...new Set([...current, ...items])];
    if (merged.length === current.length) return;
    const dropped = merged.length - MAX_PENDING_WORK;
    if (dropped > 0)
      console.error('Cron Control dropped pending work over the bound', {
        dropped,
        jobId,
      });
    this.store.write(jobId, {
      ...state,
      pendingWork: merged.slice(Math.max(0, dropped)),
    });
  }

  settlePendingWork(jobId: string, items: string[]) {
    const state = this.#read(jobId);
    const done = new Set(items);
    const current = state.pendingWork ?? [];
    const remaining = current.filter((item) => !done.has(item));
    if (remaining.length === current.length) return;
    this.store.write(jobId, { ...state, pendingWork: remaining });
  }
}

export function memoryLedgerStore() {
  const rows = new Map<string, string>();
  const counts = { reads: 0, writes: 0 };
  const store: LedgerStore = {
    list: () =>
      [...rows].map(([id, value]) => [id, JSON.parse(value) as JobState]),
    read: (jobId) => {
      counts.reads++;
      const value = rows.get(jobId);
      return value ? (JSON.parse(value) as JobState) : null;
    },
    write: (jobId, state) => {
      counts.writes++;
      rows.set(jobId, JSON.stringify(state));
    },
  };
  return { counts, store };
}

// Async facade matching the Durable Object RPC surface.
export function localLedger(core: LedgerCore): Ledger {
  return {
    addPendingWork: async (jobId, items) => core.addPendingWork(jobId, items),
    checkFence: async (jobId, generation) => core.checkFence(jobId, generation),
    pendingWork: async (jobId) => core.pendingWork(jobId),
    settlePendingWork: async (jobId, items) =>
      core.settlePendingWork(jobId, items),
    claim: async (input) => core.claim(input),
    complete: async (input) => core.complete(input),
    resume: async (jobId) => core.resume(jobId),
    status: async () => core.status(),
    stop: async (jobId, reason) => core.stop(jobId, reason),
  };
}
