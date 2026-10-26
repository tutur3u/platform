import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type {
  CalendarOAuthProvider,
  CalendarOAuthReasonCode,
} from './oauth-failure';

export type CalendarTokenOutcome =
  | 'ok'
  | 'transient'
  | 'systemic'
  | 'deactivated'
  | 'already_inactive'
  | 'fenced'
  // Permanent failure left active because its history could not be read.
  | 'deactivation_deferred';

export interface CalendarTokenOutcomeEntry {
  account: string;
  provider: CalendarOAuthProvider;
  outcome: CalendarTokenOutcome;
  reason?: CalendarOAuthReasonCode;
  providerCode?: string | null;
  attempts: number;
}

export const WORKSPACE_SYNC_ROUTE = '/api/v1/workspaces/[wsId]/calendar/sync';
export const DEACTIVATION_SPIKE_THRESHOLD = 5;

interface ConsensusBreakerState {
  // Account id -> arrival order, so concurrent workspaces admit first-come.
  accounts: Map<string, number>;
  recent?: Promise<number | null>;
}

interface TokenHealthRun {
  route: string;
  outcomes: CalendarTokenOutcomeEntry[];
  breakers: Map<CalendarOAuthReasonCode, ConsensusBreakerState>;
}

const runScope = new AsyncLocalStorage<TokenHealthRun>();

export function withCalendarTokenHealthRun<T>(
  route: string,
  run: () => Promise<T>
): Promise<{ result: T; outcomes: CalendarTokenOutcomeEntry[] }> {
  const state: TokenHealthRun = {
    route,
    outcomes: [],
    breakers: new Map(),
  };
  return runScope.run(state, async () => ({
    result: await run(),
    outcomes: state.outcomes,
  }));
}

/** Per-reason failure tally, shared across one run's workspaces. */
export function consensusBreaker(
  reason: CalendarOAuthReasonCode
): ConsensusBreakerState {
  const run = runScope.getStore();
  if (!run) return { accounts: new Map() };
  let state = run.breakers.get(reason);
  if (!state) {
    state = { accounts: new Map() };
    run.breakers.set(reason, state);
  }
  return state;
}

// Stable, non-reversible handle for correlating logs with a row id.
export function hashCalendarAccountId(tokenId: string): string {
  return createHash('sha256')
    .update(`calendar-oauth-account:${tokenId}`)
    .digest('hex')
    .slice(0, 16);
}

export function recordCalendarTokenOutcome(args: {
  tokenId: string;
  provider: CalendarOAuthProvider;
  outcome: CalendarTokenOutcome;
  reason?: CalendarOAuthReasonCode;
  providerCode?: string | null;
  attempts: number;
}): CalendarTokenOutcomeEntry {
  const run = runScope.getStore();
  const entry: CalendarTokenOutcomeEntry = {
    account: hashCalendarAccountId(args.tokenId),
    provider: args.provider,
    outcome: args.outcome,
    attempts: args.attempts,
    ...(args.reason ? { reason: args.reason } : {}),
    ...(args.providerCode ? { providerCode: args.providerCode } : {}),
  };
  run?.outcomes.push(entry);
  const line = {
    event: 'calendar.oauth.token_outcome',
    route: run?.route ?? WORKSPACE_SYNC_ROUTE,
    ...entry,
  };
  if (args.outcome === 'ok') console.info('calendar.oauth.token_outcome', line);
  else console.warn('calendar.oauth.token_outcome', line);
  return entry;
}

export function summarizeCalendarTokenOutcomes(
  outcomes: CalendarTokenOutcomeEntry[]
): Record<CalendarTokenOutcome, number> {
  const counts: Record<CalendarTokenOutcome, number> = {
    ok: 0,
    transient: 0,
    systemic: 0,
    deactivated: 0,
    already_inactive: 0,
    fenced: 0,
    deactivation_deferred: 0,
  };
  for (const entry of outcomes) counts[entry.outcome] += 1;
  return counts;
}

/**
 * Deactivation-spike alert hook. Fires on many quarantines, deferred
 * quarantines, or any systemic failure (including a tripped consensus
 * breaker). Emits one error-level line that the cron log drain stores with
 * its metadata; Infrastructure monitoring filters on the event name.
 */
export function reportCalendarDeactivationSpike(
  route: string,
  outcomes: CalendarTokenOutcomeEntry[]
): boolean {
  const counts = summarizeCalendarTokenOutcomes(outcomes);
  if (
    counts.deactivated < DEACTIVATION_SPIKE_THRESHOLD &&
    counts.deactivation_deferred === 0 &&
    counts.systemic === 0
  )
    return false;
  const reasons: Record<string, number> = {};
  for (const entry of outcomes)
    if (entry.reason && entry.outcome !== 'ok')
      reasons[entry.reason] = (reasons[entry.reason] ?? 0) + 1;
  console.error('calendar.oauth.deactivation_spike', {
    event: 'calendar.oauth.deactivation_spike',
    route,
    deactivated: counts.deactivated,
    deferred: counts.deactivation_deferred,
    systemic: counts.systemic,
    evaluated: outcomes.length,
    reasons,
  });
  return true;
}
