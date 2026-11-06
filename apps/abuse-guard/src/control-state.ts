/**
 * Pure state transitions for `GuardControl`: per-family daily usage, budget
 * stops that clear at the UTC day rollover, and a sticky operator stop.
 */
import type { AbuseGuardFamily } from '@tuturuuu/utils/abuse-guard/protocol';

export type FamilyUsage = {
  used: number;
  budget: number;
  warned: boolean;
  /** Budget stop for this family only; cleared at the next UTC day. */
  stopped: boolean;
};

export type ControlState = {
  /** Operator stop: every family fails closed until an operator resumes. */
  stopped: boolean;
  day: string;
  families: Partial<Record<AbuseGuardFamily, FamilyUsage>>;
  changedAt: number;
};

/** Share of the daily budget that emits the warning. */
export const BUDGET_WARNING_RATIO = 0.8;

export function utcDay(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

export function createControlState(now: number): ControlState {
  return { stopped: false, day: utcDay(now), families: {}, changedAt: now };
}

/** Whether a family may run: neither the operator nor its budget stopped it. */
export function familyOpen(state: ControlState, family: AbuseGuardFamily) {
  return !state.stopped && !state.families[family]?.stopped;
}

/**
 * Starts a new UTC day: every family's allowance resets and its budget stop
 * clears, so one exhausting flood cannot become an open-ended outage. The
 * operator stop is untouched. Returns whether anything changed.
 */
export function rollover(state: ControlState, now: number) {
  const day = utcDay(now);
  if (state.day === day) return false;
  state.day = day;
  for (const usage of Object.values(state.families)) {
    if (!usage) continue;
    if (usage.stopped) {
      console.warn('[abuse-guard] family budget stop cleared for a new day');
    }
    usage.used = 0;
    usage.warned = false;
    usage.stopped = false;
  }
  return true;
}

/**
 * Records a family's admitted operations. Returns whether the state changed
 * and must be saved; a zero delta with no new flag is a pure read.
 */
export function recordUsage(
  state: ControlState,
  family: AbuseGuardFamily,
  delta: number,
  budget: number,
  now: number
) {
  let changed = false;
  let usage = state.families[family];
  if (!usage) {
    usage = { used: 0, budget, warned: false, stopped: false };
    state.families[family] = usage;
    changed = true;
  }
  if (usage.budget !== budget) {
    usage.budget = budget;
    changed = true;
  }
  const admitted = Math.max(0, Math.trunc(delta));
  // A stopped fence admits nothing, so nothing it rejects is billed.
  if (admitted > 0 && familyOpen(state, family)) {
    usage.used += admitted;
    changed = true;
  }
  if (!usage.warned && usage.used >= budget * BUDGET_WARNING_RATIO) {
    usage.warned = true;
    changed = true;
    console.warn(
      `[abuse-guard] ${family} daily operation budget at ${usage.used}/${budget}`
    );
  }
  // Usage is reserved durably before execution, including interrupted work.
  if (!usage.stopped && usage.used >= budget) {
    usage.stopped = true;
    state.changedAt = now;
    changed = true;
    console.error(
      `[abuse-guard] ${family} daily operation budget exhausted (${usage.used}/${budget}); family stopped until the next UTC day`
    );
  }
  return changed;
}

/** Operator stop or resume. Resume also clears every family budget stop. */
export function setOperatorStop(
  state: ControlState,
  stopped: boolean,
  now: number
) {
  state.stopped = stopped;
  state.changedAt = now;
  if (!stopped) {
    for (const usage of Object.values(state.families)) {
      if (!usage) continue;
      usage.used = 0;
      usage.warned = false;
      usage.stopped = false;
    }
  }
}
