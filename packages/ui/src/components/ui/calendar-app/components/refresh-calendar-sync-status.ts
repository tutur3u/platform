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

const observedHealth = new WeakMap<
  QueryClient,
  Map<string, CalendarSyncStatusResponse['health']>
>();

function observeSyncCompletion(
  client: QueryClient,
  wsId: string,
  status: CalendarSyncStatusResponse
) {
  let workspaces = observedHealth.get(client);
  if (!workspaces) {
    workspaces = new Map();
    observedHealth.set(client, workspaces);
  }
  const previous = workspaces.get(wsId);
  const health = status.health;
  workspaces.set(wsId, { ...health });
  return (
    !!previous &&
    !health.currentlyRunning &&
    (previous.currentlyRunning ||
      previous.lastSuccessAt !== health.lastSuccessAt ||
      previous.lastFailureAt !== health.lastFailureAt)
  );
}

async function invalidateImportedEvents(client: QueryClient, wsId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['databaseCalendarEvents', wsId] }),
    client.invalidateQueries({ queryKey: ['provider-calendar-list', wsId] }),
  ]);
}

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
  if (observeSyncCompletion(queryClient, wsId, status)) {
    await invalidateImportedEvents(queryClient, wsId);
  }
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
    // Missing or malformed timestamps are treated as stale, with normal throttling.
    (health.state === 'healthy' &&
      Number.isFinite(lastSuccess) &&
      now - lastSuccess < SYNC_INTERVAL_MS)
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
    // Only completed requests can have imported changes. Remote runs are
    // observed by subsequent health polls before their ranges are invalidated.
    if (!alreadyRunning) await invalidateImportedEvents(queryClient, wsId);
  }
  const refreshed = await getWorkspaceCalendarSyncStatus(wsId);
  const remoteCompleted = observeSyncCompletion(queryClient, wsId, refreshed);
  if (alreadyRunning && remoteCompleted)
    await invalidateImportedEvents(queryClient, wsId);
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
