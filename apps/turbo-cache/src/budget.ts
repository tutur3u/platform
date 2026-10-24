import type { BudgetLimits } from './config';

// Successful reservations include the control snapshot PUT and two GETs.
// Denied ingress still costs a control GET; that traffic-dependent cost is
// outside these admitted-operation counters.

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
export const BUDGET_SNAPSHOT_BYTES = 4096;

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

  const classA = 1 + (request.operation === 'class-a' ? request.count : 0);
  const classB = 2 + (request.operation === 'class-b' ? request.count : 0);
  const writeBytes = BUDGET_SNAPSHOT_BYTES + request.bytes;
  if (state.monthlyClassA + classA > limits.monthlyClassAFence)
    return { allowed: false, reason: 'monthly-class-a', state };
  if (state.dailyClassA + classA > limits.dailyClassA)
    return { allowed: false, reason: 'daily-class-a', state };
  if (state.dailyClassB + classB > limits.dailyClassB)
    return { allowed: false, reason: 'daily-class-b', state };
  if (state.dailyWriteBytes + writeBytes > limits.dailyWriteBytes)
    return { allowed: false, reason: 'daily-write-bytes', state };
  const next = {
    ...state,
    dailyClassA: state.dailyClassA + classA,
    dailyClassB: state.dailyClassB + classB,
    dailyWriteBytes: state.dailyWriteBytes + writeBytes,
    monthlyClassA: state.monthlyClassA + classA,
  };
  return {
    allowed: true,
    state:
      next.monthlyClassA === limits.monthlyClassAFence
        ? trip(next, 'monthly-class-a', now)
        : next,
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

export function isBudgetState(value: unknown): value is BudgetState {
  if (!value || typeof value !== 'object') return false;
  if (
    !('day' in value) ||
    typeof value.day !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.day)
  )
    return false;
  if (!('month' in value) || value.month !== value.day.slice(0, 7))
    return false;
  for (const key of [
    'dailyClassA',
    'dailyClassB',
    'dailyWriteBytes',
    'monthlyClassA',
  ]) {
    const counter = Reflect.get(value, key);
    if (
      typeof counter !== 'number' ||
      !Number.isSafeInteger(counter) ||
      counter < 0
    )
      return false;
  }
  if (!('fence' in value) || !value.fence || typeof value.fence !== 'object')
    return false;
  const fence = value.fence;
  return (
    'tripped' in fence &&
    typeof fence.tripped === 'boolean' &&
    (!('reason' in fence) || typeof fence.reason === 'string') &&
    (!('at' in fence) || typeof fence.at === 'string')
  );
}
