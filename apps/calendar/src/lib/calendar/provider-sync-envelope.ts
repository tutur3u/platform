import type { CalendarOAuthProvider } from './oauth-failure';
import {
  type CalendarTokenOutcomeEntry,
  summarizeCalendarTokenOutcomes,
  systemicProviders,
} from './oauth-token-health';

// Response contract for the scheduler. Cron Control reads `ok` from a body of
// at most 64 KiB: `ok: false` (or an unreadable body) counts against the job's
// failure budget and five in a row stop the job for everyone. So `ok` reports
// whether the run itself worked, never whether every account synced; account
// detail stays bounded here and complete in the per-outcome logs.

// Accounts that failed systemically (our OAuth client), per provider, before
// the run counts as failed; a smaller sample counts when every evaluated
// account failed that way. Holds and revocations never count.
export const SYSTEMIC_ACCOUNTS = 3;
// Non-ok accounts listed in the body; the rest are only counted and logged.
export const MAX_ATTENTION_ENTRIES = 50;

export interface WorkspaceDispatchResult {
  ws_id: string;
  success: boolean;
  // True when the workspace sync ran to completion, even with account-level
  // failures; false when it threw, timed out or returned a non-2xx status.
  completed: boolean;
  error?: string;
}

export interface WorkspaceDispatch {
  processed: number;
  deferred: number;
  results: WorkspaceDispatchResult[];
}

export interface ProviderSyncEnvelope {
  status: 200 | 500;
  body: {
    ok: boolean;
    error?: string;
    providers?: CalendarOAuthProvider[];
    partialFailure: boolean;
    processed: number;
    deferred: number;
    successful: number;
    failed: number;
    failures: Array<{ ws_id: string; error: string }>;
    tokens: {
      counts: ReturnType<typeof summarizeCalendarTokenOutcomes>;
      attention: CalendarTokenOutcomeEntry[];
      attentionOmitted: number;
    };
  };
}

export function buildProviderSyncEnvelope(
  dispatch: WorkspaceDispatch,
  outcomes: CalendarTokenOutcomeEntry[]
): ProviderSyncEnvelope {
  const failures = dispatch.results
    .filter((result) => !result.success)
    .map((result) => ({
      ws_id: result.ws_id,
      error: result.error ?? 'Calendar sync partially failed',
    }));
  const attention = outcomes.filter((entry) => entry.outcome !== 'ok');
  const brokenProviders = systemicProviders(outcomes, SYSTEMIC_ACCOUNTS);
  // Every dispatched workspace failed before completing: nothing ran.
  const nothingCompleted =
    dispatch.results.length > 0 &&
    dispatch.results.every((result) => !result.completed);
  const failedRun = brokenProviders.length > 0 || nothingCompleted;

  return {
    status: brokenProviders.length ? 500 : 200,
    body: {
      ok: !failedRun,
      ...(brokenProviders.length
        ? {
            error: 'Calendar OAuth client failure',
            providers: brokenProviders,
          }
        : nothingCompleted
          ? { error: 'No workspace sync completed' }
          : {}),
      partialFailure: failures.length > 0 || attention.length > 0,
      processed: dispatch.processed,
      deferred: dispatch.deferred,
      successful: dispatch.results.length - failures.length,
      failed: failures.length,
      failures,
      tokens: {
        counts: summarizeCalendarTokenOutcomes(outcomes),
        attention: attention.slice(0, MAX_ATTENTION_ENTRIES),
        attentionOmitted: Math.max(0, attention.length - MAX_ATTENTION_ENTRIES),
      },
    },
  };
}
