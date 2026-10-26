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
  | 'deactivation_deferred'
  // Permanent failure left active by the consensus breaker.
  | 'consensus_hold';

export interface CalendarTokenOutcomeEntry {
  account: string;
  provider: CalendarOAuthProvider;
  outcome: CalendarTokenOutcome;
  reason?: CalendarOAuthReasonCode;
  providerCode?: string | null;
  attempts: number;
  // True only when the provider issued a fresh credential in this run.
  refreshed?: boolean;
}

export const WORKSPACE_SYNC_ROUTE = '/api/v1/workspaces/[wsId]/calendar/sync';
export const DEACTIVATION_SPIKE_THRESHOLD = 5;
const SPIKE_REPEAT_MS = 60 * 60 * 1000;
const CRON_INTERVAL_MS = 15 * 60 * 1000;

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
  refreshed?: boolean;
}): CalendarTokenOutcomeEntry {
  const run = runScope.getStore();
  const entry: CalendarTokenOutcomeEntry = {
    account: hashCalendarAccountId(args.tokenId),
    provider: args.provider,
    outcome: args.outcome,
    attempts: args.attempts,
    ...(args.reason ? { reason: args.reason } : {}),
    ...(args.providerCode ? { providerCode: args.providerCode } : {}),
    ...(args.refreshed ? { refreshed: true } : {}),
  };
  // One outcome per account per run: a later failure replaces an earlier ok.
  if (run) {
    const previous = run.outcomes.findIndex(
      (item) => item.account === entry.account
    );
    if (previous >= 0) run.outcomes[previous] = entry;
    else run.outcomes.push(entry);
  }
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
    consensus_hold: 0,
  };
  for (const entry of outcomes) counts[entry.outcome] += 1;
  return counts;
}

/**
 * Deactivation-spike alert hook. Fires on many quarantines, deferred
 * quarantines, breaker holds, or any systemic failure. Emits an error-level log
 * and returns whether the provider cron should queue an operator notification.
 */
export function reportCalendarDeactivationSpike(
  route: string,
  outcomes: CalendarTokenOutcomeEntry[],
  now = Date.now()
): boolean {
  const counts = summarizeCalendarTokenOutcomes(outcomes);
  // Deactivations are new by definition. Holds, deferrals and systemic
  // failures repeat every run, so they alert in the first run of each hour.
  const recurringDue = now % SPIKE_REPEAT_MS < CRON_INTERVAL_MS;
  const transientProviders = [
    ...new Set(outcomes.map((entry) => entry.provider)),
  ].filter((provider) =>
    outcomes
      .filter((entry) => entry.provider === provider)
      .every((entry) => entry.outcome === 'transient')
  );
  if (
    counts.deactivated < DEACTIVATION_SPIKE_THRESHOLD &&
    !(
      recurringDue &&
      (counts.deactivation_deferred + counts.consensus_hold + counts.systemic >
        0 ||
        transientProviders.length > 0)
    )
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
    held: counts.consensus_hold,
    systemic: counts.systemic,
    transient: counts.transient,
    transientProviders,
    evaluated: outcomes.length,
    reasons,
  });
  return true;
}

/**
 * Providers whose OAuth client is broken for everyone in this run: no account
 * obtained a fresh credential, and either at least `threshold` accounts failed
 * with an explicit client-wide diagnosis (`systemic`) or every evaluated
 * account did (a small sample, such as one account with a missing secret).
 * Holds, revocations and transient failures only alert: an account or a
 * single tenant (for example one that removed our app) must never fail the
 * shared job.
 */
export function systemicProviders(
  outcomes: CalendarTokenOutcomeEntry[],
  threshold: number
): CalendarOAuthProvider[] {
  const providers = new Set(outcomes.map((entry) => entry.provider));
  return [...providers].filter((provider) => {
    const own = outcomes.filter((entry) => entry.provider === provider);
    const systemic = own.filter((entry) => entry.outcome === 'systemic').length;
    // An unexpired credential used without a refresh proves nothing about
    // the client; only a fresh one does.
    const refreshedOk = own.some(
      (entry) => entry.outcome === 'ok' && entry.refreshed
    );
    const allSystemic = own.length > 0 && systemic === own.length;
    return (systemic >= threshold || allSystemic) && !refreshedOk;
  });
}
