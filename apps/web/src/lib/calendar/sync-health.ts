export type SyncHealthState =
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

const TOKEN_EXPIRY_WARNING_MS = 5 * 60 * 1000;
const RUNNING_WINDOW_MS = 5 * 60 * 1000;

function isRunningRecord(record: SyncDashboardRecord, nowMs: number): boolean {
  if (record.status !== 'running' || !record.start_time) {
    return false;
  }

  const startedAtMs = new Date(record.start_time).getTime();
  if (Number.isNaN(startedAtMs)) {
    return false;
  }

  return nowMs - startedAtMs <= RUNNING_WINDOW_MS;
}

function isExpiringSoon(expiresAt: string | null, nowMs: number): boolean {
  if (!expiresAt) {
    return false;
  }

  const expiryMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiryMs)) {
    return false;
  }

  return expiryMs - nowMs <= TOKEN_EXPIRY_WARNING_MS;
}

export function classifyCalendarSyncHealth(args: {
  accounts: ConnectedCalendarAccountSummary[];
  recentRuns: SyncDashboardRecord[];
  now?: Date;
}): CalendarSyncHealthSummary {
  const nowMs = (args.now ?? new Date()).getTime();
  const lastSuccess =
    args.recentRuns.find((record) => record.status === 'success') ?? null;
  const lastFailure =
    args.recentRuns.find((record) => record.status === 'failed') ?? null;
  const currentRun =
    args.recentRuns.find((record) => isRunningRecord(record, nowMs)) ?? null;
  const retryAfterSeconds =
    args.recentRuns.find(
      (record) => typeof record.cooldown_remaining_seconds === 'number'
    )?.cooldown_remaining_seconds ?? null;

  if (args.accounts.length === 0) {
    return {
      state: 'disconnected',
      reason: 'no_accounts',
      lastSuccessAt: lastSuccess?.end_time ?? null,
      lastFailureAt: lastFailure?.end_time ?? lastFailure?.start_time ?? null,
      currentlyRunning: false,
      retryAfterSeconds,
    };
  }

  if (currentRun) {
    return {
      state: 'syncing',
      reason: 'running',
      lastSuccessAt: lastSuccess?.end_time ?? null,
      lastFailureAt: lastFailure?.end_time ?? lastFailure?.start_time ?? null,
      currentlyRunning: true,
      retryAfterSeconds,
    };
  }

  if (
    args.accounts.some((account) => isExpiringSoon(account.expires_at, nowMs))
  ) {
    return {
      state: 'degraded',
      reason: 'token_expiring',
      lastSuccessAt: lastSuccess?.end_time ?? null,
      lastFailureAt: lastFailure?.end_time ?? lastFailure?.start_time ?? null,
      currentlyRunning: false,
      retryAfterSeconds,
    };
  }

  const lastSuccessMs = lastSuccess?.end_time
    ? new Date(lastSuccess.end_time).getTime()
    : 0;
  const lastFailureMs = lastFailure?.end_time
    ? new Date(lastFailure.end_time).getTime()
    : lastFailure?.start_time
      ? new Date(lastFailure.start_time).getTime()
      : 0;

  if (lastFailureMs && lastFailureMs >= lastSuccessMs) {
    return {
      state: 'degraded',
      reason: lastFailure?.error_type || 'last_run_failed',
      lastSuccessAt: lastSuccess?.end_time ?? null,
      lastFailureAt: lastFailure?.end_time ?? lastFailure?.start_time ?? null,
      currentlyRunning: false,
      retryAfterSeconds,
    };
  }

  return {
    state: 'healthy',
    reason: 'ok',
    lastSuccessAt: lastSuccess?.end_time ?? null,
    lastFailureAt: lastFailure?.end_time ?? lastFailure?.start_time ?? null,
    currentlyRunning: false,
    retryAfterSeconds,
  };
}
