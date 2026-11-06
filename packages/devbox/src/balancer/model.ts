// Dependency-free run model for the fleet balancer. Shared by the SDK
// controller, host records and the Infrastructure read view, so it imports
// nothing and never touches I/O.

export const BALANCER_TERMINAL_STATES = [
  'succeeded',
  'failed',
  'cancelled',
  'setup_failed',
  'rejected',
] as const;
export const BALANCER_RUN_STATES = [
  'queued',
  'placed',
  'preparing',
  'running',
  'unknown',
  ...BALANCER_TERMINAL_STATES,
] as const;
export type BalancerTerminalState = (typeof BALANCER_TERMINAL_STATES)[number];
export type BalancerRunState = (typeof BALANCER_RUN_STATES)[number];
export type BalancerPurpose =
  | 'test'
  | 'lint'
  | 'typecheck'
  | 'build'
  | 'verify'
  | 'review';
export type BalancerJobClass = 'light' | 'heavy';

export interface BalancerSource {
  repo: string;
  baseSha: string;
  // Dirty-source layers; absent for an exact pushed commit.
  patch?: { digest: string; bytes: number };
  manifest?: { digest: string; files: number };
}
export interface BalancerRequester {
  kind: 'user' | 't3-thread';
  threadId?: string;
  taskId?: string;
  pr?: { repo: string; number: number; headSha: string };
}
export interface BalancerConstraints {
  os?: string[];
  arch?: string[];
  hosts?: string[];
  excludeHosts?: string[];
}
export interface BalancerRunRequest {
  requestId: string;
  requester: BalancerRequester;
  purpose: BalancerPurpose;
  source: BalancerSource;
  command: string[];
  cwd: string;
  jobClass: BalancerJobClass;
  priority: number;
  constraints: BalancerConstraints;
  replicas: number;
  timeoutSeconds: number;
  install: boolean;
}
export interface BalancerLease {
  leaseId: string;
  runId: string;
  deviceId: string;
  // Increments only when a run is explicitly re-leased; the host record and
  // result must carry the same value or they are rejected.
  fence: number;
  issuedAt: string;
}
export interface BalancerResult {
  // One result per lease, so the result identity is the lease identity.
  resultId: string;
  runId: string;
  fence: number;
  status: BalancerTerminalState;
  exitCode: number | null;
  phase: 'admission' | 'setup' | 'command' | 'supervisor';
  startedAt?: string;
  finishedAt: string;
  logBytes?: number;
  logSha256?: string;
  reason?: string;
}
export interface BalancerConsumption {
  threadId: string;
  resultId: string;
  consumedAt: string;
}
export interface BalancerTransition {
  at: string;
  from: BalancerRunState | null;
  to: BalancerRunState;
  reason?: string;
}
export interface BalancerRun {
  runId: string;
  requestId: string;
  replica: number;
  sourceId: string;
  source: BalancerSource;
  requester: BalancerRequester;
  purpose: BalancerPurpose;
  command: string[];
  cwd: string;
  jobClass: BalancerJobClass;
  priority: number;
  constraints: BalancerConstraints;
  timeoutSeconds: number;
  install: boolean;
  queuedAt: string;
  state: BalancerRunState;
  revision: number;
  deviceId?: string;
  lease?: BalancerLease;
  result?: BalancerResult;
  cancelRequestedAt?: string;
  blockedBy?: string;
  consumedBy: BalancerConsumption[];
  history: BalancerTransition[];
}

export const isBalancerTerminal = (
  state: BalancerRunState
): state is BalancerTerminalState =>
  (BALANCER_TERMINAL_STATES as readonly string[]).includes(state);

// UNKNOWN never returns to queued or placed: an uncertain run is reconciled
// from its host record, never rescheduled.
const transitions: Record<BalancerRunState, readonly BalancerRunState[]> = {
  queued: ['placed', 'cancelled', 'rejected'],
  placed: ['preparing', 'running', 'unknown', ...BALANCER_TERMINAL_STATES],
  preparing: ['running', 'unknown', ...BALANCER_TERMINAL_STATES],
  running: ['unknown', ...BALANCER_TERMINAL_STATES],
  unknown: ['preparing', 'running', ...BALANCER_TERMINAL_STATES],
  succeeded: [],
  failed: [],
  cancelled: [],
  setup_failed: [],
  rejected: [],
};
export const canTransition = (from: BalancerRunState, to: BalancerRunState) =>
  from === to || transitions[from].includes(to);

export class BalancerTransitionError extends Error {
  constructor(from: BalancerRunState, to: BalancerRunState) {
    super(`Run cannot move from ${from} to ${to}.`);
    this.name = 'BalancerTransitionError';
  }
}

export function advanceRun(
  run: BalancerRun,
  to: BalancerRunState,
  at: string,
  reason?: string,
  patch: Partial<
    Pick<BalancerRun, 'deviceId' | 'lease' | 'blockedBy' | 'cancelRequestedAt'>
  > = {}
): BalancerRun {
  if (!canTransition(run.state, to))
    throw new BalancerTransitionError(run.state, to);
  if (run.state === to && !reason && !Object.keys(patch).length) return run;
  return {
    ...run,
    ...patch,
    state: to,
    revision: run.revision + 1,
    history: [
      ...run.history,
      { at, from: run.state, to, ...(reason ? { reason } : {}) },
    ],
  };
}

export type ResultVerdict =
  | { accepted: true; run: BalancerRun; duplicate: boolean }
  | { accepted: false; reason: string };

// A result counts only for the run's current lease and fence. A repeat of
// the accepted result is a no-op, so delivery can be retried safely.
export function acceptResult(
  run: BalancerRun,
  result: BalancerResult,
  at: string
): ResultVerdict {
  if (!run.lease) return { accepted: false, reason: 'run has no lease' };
  if (result.runId !== run.runId)
    return { accepted: false, reason: 'result belongs to another run' };
  if (result.resultId !== run.lease.leaseId || result.fence !== run.lease.fence)
    return { accepted: false, reason: 'result carries a stale lease' };
  if (run.result) {
    if (run.result.resultId === result.resultId)
      return { accepted: true, run, duplicate: true };
    return { accepted: false, reason: 'run already has a result' };
  }
  if (!canTransition(run.state, result.status))
    return {
      accepted: false,
      reason: `run in ${run.state} cannot accept ${result.status}`,
    };
  return {
    accepted: true,
    duplicate: false,
    run: {
      ...advanceRun(run, result.status, at, result.reason),
      result,
    },
  };
}

// Records that a thread consumed a terminal result exactly once.
export function consumeResult(
  run: BalancerRun,
  threadId: string,
  at: string
): { run: BalancerRun; alreadyConsumed: boolean } {
  if (!run.result || !isBalancerTerminal(run.state))
    throw new Error('Only a terminal result can be consumed.');
  const resultId = run.result.resultId;
  if (
    run.consumedBy.some(
      (entry) => entry.threadId === threadId && entry.resultId === resultId
    )
  )
    return { run, alreadyConsumed: true };
  return {
    alreadyConsumed: false,
    run: {
      ...run,
      revision: run.revision + 1,
      consumedBy: [...run.consumedBy, { threadId, resultId, consumedAt: at }],
    },
  };
}

export const BALANCER_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
export const runIdFor = (requestId: string, replica: number) =>
  `${requestId}-r${replica}`;
export const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}-r[1-8]$/u;
