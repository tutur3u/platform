import type { BudgetLimits } from './config';

// Pure admission accounting for billable R2 operations. Class A covers
// writes (PutObject), class B covers reads (GetObject/HeadObject). Daily caps
// pause one operation class until the next UTC day; exceeding the monthly
// class A fence trips a durable stop that only an operator reset clears.

export type OperationClass = 'class-a' | 'class-b';

export interface AdmissionRequest {
  operation: OperationClass;
  count: number;
  bytes: number;
}

export interface BudgetFence {
  tripped: boolean;
  reason?: string;
  at?: string;
}

export interface BudgetState {
  day: string;
  month: string;
  dailyClassA: number;
  dailyClassB: number;
  dailyWriteBytes: number;
  monthlyClassA: number;
  fence: BudgetFence;
}

export type DenyReason =
  | 'fenced'
  | 'daily-class-a'
  | 'daily-class-b'
  | 'daily-write-bytes'
  | 'monthly-class-a';

export interface AdmissionResult {
  allowed: boolean;
  reason?: DenyReason;
  state: BudgetState;
}

const MAX_COUNT = 200;

function utcDay(now: Date) {
  return now.toISOString().slice(0, 10);
}

export function emptyState(now: Date): BudgetState {
  return {
    day: utcDay(now),
    month: utcDay(now).slice(0, 7),
    dailyClassA: 0,
    dailyClassB: 0,
    dailyWriteBytes: 0,
    monthlyClassA: 0,
    fence: { tripped: false },
  };
}

export function rollState(state: BudgetState, now: Date): BudgetState {
  const day = utcDay(now);
  const month = day.slice(0, 7);
  if (state.day === day) return state;
  return {
    ...state,
    day,
    month,
    dailyClassA: 0,
    dailyClassB: 0,
    dailyWriteBytes: 0,
    // The monthly counter resets with the month; the fence never resets
    // implicitly.
    monthlyClassA: state.month === month ? state.monthlyClassA : 0,
  };
}

export function isAdmissionRequest(value: unknown): value is AdmissionRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  return (
    (request.operation === 'class-a' || request.operation === 'class-b') &&
    Number.isSafeInteger(request.count) &&
    (request.count as number) >= 1 &&
    (request.count as number) <= MAX_COUNT &&
    Number.isSafeInteger(request.bytes) &&
    (request.bytes as number) >= 0
  );
}

export function admit(
  previous: BudgetState,
  request: AdmissionRequest,
  limits: BudgetLimits,
  now: Date
): AdmissionResult {
  const state = rollState(previous, now);
  if (state.fence.tripped) return { allowed: false, reason: 'fenced', state };

  if (request.operation === 'class-b') {
    if (state.dailyClassB + request.count > limits.dailyClassB)
      return { allowed: false, reason: 'daily-class-b', state };
    return {
      allowed: true,
      state: { ...state, dailyClassB: state.dailyClassB + request.count },
    };
  }

  if (state.monthlyClassA + request.count > limits.monthlyClassAFence) {
    return {
      allowed: false,
      reason: 'monthly-class-a',
      state: trip(state, 'monthly-class-a', now),
    };
  }
  if (state.dailyClassA + request.count > limits.dailyClassA)
    return { allowed: false, reason: 'daily-class-a', state };
  if (state.dailyWriteBytes + request.bytes > limits.dailyWriteBytes)
    return { allowed: false, reason: 'daily-write-bytes', state };
  return {
    allowed: true,
    state: {
      ...state,
      dailyClassA: state.dailyClassA + request.count,
      dailyWriteBytes: state.dailyWriteBytes + request.bytes,
      monthlyClassA: state.monthlyClassA + request.count,
    },
  };
}

export function trip(state: BudgetState, reason: string, now: Date) {
  return {
    ...state,
    fence: { tripped: true, reason, at: now.toISOString() },
  };
}

export function reset(state: BudgetState, now: Date): BudgetState {
  return { ...rollState(state, now), fence: { tripped: false } };
}
