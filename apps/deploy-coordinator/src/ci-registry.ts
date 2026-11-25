import type { CiStore } from './ci-store';
import { utcDay } from './core';
import { CoordinatorError, type EnvironmentMeta, type Result } from './types';

// Main-branch CI registrations (apps/docs/build/devops/coordinator-ci-orchestration.mdx).
// One Durable Object, named CI_OBJECT, records the plan each main push would
// run. It dispatches and cancels nothing.
export const CI_OBJECT = 'ci:main';

export const CI_LIMITS = {
  // Main takes about 150 pushes on its busiest days; a repeated registration
  // of a SHA is answered from storage and not counted. 400 leaves more than
  // twice that headroom and caps the object at about 1,200 rows written a day.
  dailyBudget: 400,
  // Newest registrations kept; older ones are deleted by the insert that
  // pushes them out.
  retain: 500,
  maxPlanEntries: 120,
  maxBodyBytes: 16_384,
  maxListLimit: 100,
  defaultListLimit: 30,
  reasonLength: 120,
} as const;

export type CiPlanEntry = {
  workflow: string;
  run: boolean;
  reason: string;
  closureKey: string | null;
};

export type CiRegistration = {
  sha: string;
  before: string | null;
  base: string | null;
  plan: CiPlanEntry[];
  runId: number;
  runAttempt: number;
  actor: string;
  logsUrl: string;
  registeredAt: number;
};

export type CiRegistrationInput = Omit<CiRegistration, 'registeredAt'>;

export type CiStatus = {
  meta: EnvironmentMeta;
  registrations: number;
  budget: { day: string; used: number; limit: number };
};

export type CiOperation =
  | { op: 'register'; input: CiRegistrationInput }
  | { op: 'list'; limit: number }
  | { op: 'get'; sha: string }
  | { op: 'status' }
  | { op: 'stop'; actor: string; reason: string }
  | { op: 'resume' };

export type Transact = <T>(work: () => T) => T;

function fail(code: CoordinatorError['code'], message?: string): never {
  throw new CoordinatorError(code, message);
}

// Order matters for cost: a stopped object and a repeat answer before the
// budget is touched, and an exhausted budget answers before anything is
// written, so each of those writes no rows.
function register(store: CiStore, input: CiRegistrationInput, now: number) {
  if (store.readMeta().stopped) fail('STOPPED', 'CI registration is stopped');
  const existing = store.read(input.sha);
  if (existing) return { registration: existing, created: false };
  if (store.countRequest(utcDay(now), CI_LIMITS.dailyBudget) === null)
    fail('BUDGET_EXHAUSTED');
  const registration: CiRegistration = { ...input, registeredAt: now };
  store.insert(registration);
  store.prune(CI_LIMITS.retain);
  return { registration, created: true };
}

function stop(store: CiStore, actor: string, reason: string, now: number) {
  const meta = store.readMeta();
  if (meta.stopped) return meta;
  const next: EnvironmentMeta = {
    stopped: true,
    stopRevision: meta.stopRevision + 1,
    stopReason: reason,
    stoppedBy: actor,
    updatedAt: now,
  };
  store.writeMeta(next);
  return next;
}

function resume(store: CiStore, now: number) {
  const meta = store.readMeta();
  if (!meta.stopped) return meta;
  const next = { ...meta, stopped: false, stopReason: null, updatedAt: now };
  store.writeMeta(next);
  return next;
}

function dispatch(store: CiStore, operation: CiOperation, now: number) {
  switch (operation.op) {
    case 'register':
      return register(store, operation.input, now);
    case 'list':
      return { registrations: store.list(operation.limit) };
    case 'get':
      return store.read(operation.sha) ?? fail('NOT_FOUND');
    case 'status': {
      const day = utcDay(now);
      return {
        meta: store.readMeta(),
        registrations: store.count(),
        budget: {
          day,
          used: store.budgetUsed(day),
          limit: CI_LIMITS.dailyBudget,
        },
      } satisfies CiStatus;
    }
    case 'stop':
      return stop(store, operation.actor, operation.reason, now);
    case 'resume':
      return resume(store, now);
  }
}

// Runs one operation in one transaction. Only a new registration is counted
// against the daily budget; operator reads, stop and resume never are.
export function runCiOperation(
  store: CiStore,
  transact: Transact,
  operation: CiOperation,
  now: number
): Result<unknown> {
  try {
    return transact(() => ({
      ok: true as const,
      value: dispatch(store, operation, now),
    }));
  } catch (error) {
    if (error instanceof CoordinatorError)
      return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}
