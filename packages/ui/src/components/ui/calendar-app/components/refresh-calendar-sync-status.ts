import {
  focusManager,
  onlineManager,
  type QueryClient,
  queryOptions,
} from '@tanstack/react-query';
import type { CalendarSyncStatusResponse } from '@tuturuuu/internal-api/calendar';
import { getWorkspaceCalendarSyncStatus } from '@tuturuuu/internal-api/calendar';

import {
  isCalendarProviderSyncRunning,
  runCalendarProviderSync,
} from '../../../../hooks/calendar-provider-sync';

const SYNC_INTERVAL_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 30 * 60_000;
type Attempt = { running: boolean; nextAt: number; failures: number };
// All calendar controls in one app share a coordinator, scoped to their session.
const attempts = new WeakMap<QueryClient, Map<string, Attempt>>();

export function calendarSyncStatusQueryOptions(
  queryClient: QueryClient,
  wsId: string,
  syncBlocked = false
) {
  return queryOptions({
    queryKey: ['calendar-sync-status', wsId],
    queryFn: () => refreshCalendarSyncStatus(queryClient, wsId, syncBlocked),
    enabled: !!wsId,
    staleTime: 15_000,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    refetchIntervalInBackground: false,
    retry: 1,
    refetchInterval: (query) =>
      query.state.data?.health.currentlyRunning ||
      query.state.data?.health.retryAfterSeconds
        ? 5_000
        : 30_000,
  });
}

/** The foreground health poll also keeps connected providers up to date. */
export async function refreshCalendarSyncStatus(
  queryClient: QueryClient,
  wsId: string,
  syncBlocked = false
): Promise<CalendarSyncStatusResponse> {
  const status = await getWorkspaceCalendarSyncStatus(wsId);
  const { health } = status;
  const now = Date.now();
  let workspaceAttempts = attempts.get(queryClient);
  if (!workspaceAttempts) {
    workspaceAttempts = new Map();
    attempts.set(queryClient, workspaceAttempts);
  }
  const previous = workspaceAttempts.get(wsId);
  const lastSuccess = Date.parse(health.lastSuccessAt ?? '');
  const lastFailure = Date.parse(health.lastFailureAt ?? '');
  const recentFailure =
    health.state === 'degraded' && now - lastFailure < SYNC_INTERVAL_MS * 2;
  if (
    !focusManager.isFocused() ||
    !onlineManager.isOnline() ||
    (typeof document !== 'undefined' &&
      document.visibilityState === 'hidden') ||
    syncBlocked ||
    recentFailure ||
    isCalendarProviderSyncRunning(queryClient, wsId) ||
    queryClient.isMutating({ mutationKey: ['calendar-provider-sync', wsId] }) >
      0 ||
    previous?.running ||
    (previous?.nextAt ?? 0) > now ||
    !status.accountsSummary.total ||
    !status.connectionsSummary.enabled ||
    health.currentlyRunning ||
    health.state === 'paused' ||
    health.state === 'disconnected' ||
    (health.retryAfterSeconds ?? 0) > 0 ||
    ['auth', 'reconnect_required', 'configuration'].includes(health.reason) ||
    (health.state === 'healthy' && now - lastSuccess < SYNC_INTERVAL_MS)
  )
    return status;

  const attempt: Attempt = {
    running: true,
    nextAt: now + SYNC_INTERVAL_MS,
    failures: previous?.failures ?? 0,
  };
  workspaceAttempts.set(wsId, attempt);
  queryClient.setQueryData(['calendar-sync-status', wsId], {
    ...status,
    health: { ...health, state: 'syncing', currentlyRunning: true },
  });
  let failed = false;
  let alreadyRunning = false;
  try {
    const result = await runCalendarProviderSync(queryClient, wsId);
    alreadyRunning = !!result.alreadyRunning;
    if (alreadyRunning) attempt.nextAt = Date.now() + 30_000;
    failed = !result.ok;
    if (result.retryAfterSeconds) {
      attempt.nextAt = Math.max(
        attempt.nextAt,
        Date.now() + result.retryAfterSeconds * 1000
      );
    }
  } catch {
    // Polling failures stay in the recovery UI; background work never spams toasts.
    failed = true;
  } finally {
    attempt.running = false;
    if (!alreadyRunning) attempt.failures = failed ? attempt.failures + 1 : 0;
    if (!alreadyRunning)
      attempt.nextAt = Math.max(
        attempt.nextAt,
        Date.now() +
          Math.min(
            MAX_BACKOFF_MS,
            SYNC_INTERVAL_MS * 2 ** Math.min(attempt.failures, 3)
          )
      );
    // Partial imports can still change events. Invalidate every loaded range.
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['databaseCalendarEvents', wsId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['provider-calendar-list', wsId],
      }),
    ]);
  }
  const refreshed = await getWorkspaceCalendarSyncStatus(wsId);
  if (failed && refreshed.health.state === 'healthy') {
    return {
      ...refreshed,
      health: {
        ...refreshed.health,
        state: 'degraded',
        reason: 'last_run_failed',
      },
    };
  }
  return refreshed;
}
