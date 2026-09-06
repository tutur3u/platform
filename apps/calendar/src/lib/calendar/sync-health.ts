export type SyncHealthState =
  | 'paused'
  | 'disconnected'
  | 'syncing'
  | 'healthy'
  | 'degraded';

export interface SyncDashboardRecord {
  status: string | null;
  start_time: string | null;
  end_time: string | null;
  error_message?: string | null;
  error_type?: string | null;
  cooldown_remaining_seconds?: number | null;
}

export interface ConnectedCalendarAccountSummary {
  provider: 'google' | 'microsoft';
  expires_at: string | null;
}

export interface CalendarSyncHealthSummary {
  state: SyncHealthState;
  reason: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  currentlyRunning: boolean;
  retryAfterSeconds: number | null;
}

const RUNNING_WINDOW_MS = 5 * 60 * 1000;
// Allow three scheduled 15-minute runs before declaring the data stale.
const STALE_WINDOW_MS = 45 * 60 * 1000;

function timestamp(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function classifyCalendarSyncHealth(args: {
  accounts: ConnectedCalendarAccountSummary[];
  recentRuns: SyncDashboardRecord[];
  hasOrphanedConnections?: boolean;
  hasEnabledConnections?: boolean;
  now?: Date;
}): CalendarSyncHealthSummary {
  const nowMs = (args.now ?? new Date()).getTime();
  const runs = [...args.recentRuns].sort(
    (a, b) => timestamp(b.start_time) - timestamp(a.start_time)
  );
  const lastSuccess = runs.find(
    (run) => run.status === 'completed' || run.status === 'success'
  );
  const lastFailure = runs.find((run) => run.status === 'failed');
  const latest = runs[0];
  const currentRun = runs.find((run) => {
    const age = nowMs - timestamp(run.start_time);
    return run.status === 'running' && age >= 0 && age < RUNNING_WINDOW_MS;
  });
  const latestAge = latest ? nowMs - timestamp(latest.start_time) : Infinity;
  const summary = {
    lastSuccessAt: lastSuccess?.end_time ?? null,
    lastFailureAt: lastFailure?.end_time ?? lastFailure?.start_time ?? null,
    currentlyRunning: !!currentRun,
    // Stored cooldown values are snapshots, not permanent retry locks.
    retryAfterSeconds:
      latestAge >= 0 && latestAge < 30_000
        ? Math.ceil((30_000 - latestAge) / 1000)
        : null,
  };
  const result = (state: SyncHealthState, reason: string) => ({
    ...summary,
    state,
    reason,
  });
  if (args.hasOrphanedConnections)
    return result('degraded', 'reconnect_required');
  if (!args.accounts.length) return result('disconnected', 'no_accounts');
  if (currentRun) return result('syncing', 'running');
  if (args.hasEnabledConnections === false)
    return result('paused', 'no_enabled_calendars');
  if (latest?.status === 'running') return result('degraded', 'sync_stalled');
  if (latest?.status === 'failed') {
    return result('degraded', latest.error_type || 'last_run_failed');
  }
  // Access tokens routinely expire and refresh automatically; their expiry alone
  // is not evidence that the user needs to reconnect a working Google account.
  if (!lastSuccess) return result('degraded', 'not_synced');
  if (nowMs - timestamp(lastSuccess.end_time) > STALE_WINDOW_MS) {
    return result('degraded', 'sync_stale');
  }
  return result('healthy', 'ok');
}
