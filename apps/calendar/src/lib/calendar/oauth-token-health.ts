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
  // Permanent failure seen after this run's quarantine budget ran out.
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
// One run may quarantine at most this many credentials. A provider incident
// that rejects many healthy credentials at once stops here and alerts instead.
export const MAX_DEACTIVATIONS_PER_RUN = 20;
export const DEACTIVATION_SPIKE_THRESHOLD = 5;

interface TokenHealthRun {
  route: string;
  quarantineAttempts: number;
  outcomes: CalendarTokenOutcomeEntry[];
}

const runScope = new AsyncLocalStorage<TokenHealthRun>();

export function withCalendarTokenHealthRun<T>(
  route: string,
  run: () => Promise<T>
): Promise<{ result: T; outcomes: CalendarTokenOutcomeEntry[] }> {
  const state: TokenHealthRun = { route, quarantineAttempts: 0, outcomes: [] };
  return runScope.run(state, async () => ({
    result: await run(),
    outcomes: state.outcomes,
  }));
}

/** Reserves one quarantine write from the current run's budget. */
export function reserveQuarantineAttempt(): boolean {
  const run = runScope.getStore();
  if (!run) return true;
  if (run.quarantineAttempts >= MAX_DEACTIVATIONS_PER_RUN) return false;
  run.quarantineAttempts += 1;
  return true;
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
 * Deactivation-spike alert hook. Emits one error-level line that the cron
 * log drain stores with its metadata; Infrastructure monitoring filters on
 * the event name.
 */
export function reportCalendarDeactivationSpike(
  route: string,
  outcomes: CalendarTokenOutcomeEntry[]
): boolean {
  const counts = summarizeCalendarTokenOutcomes(outcomes);
  if (
    counts.deactivated < DEACTIVATION_SPIKE_THRESHOLD &&
    counts.deactivation_deferred === 0
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
    evaluated: outcomes.length,
    reasons,
  });
  return true;
}
