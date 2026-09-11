import type { QueryClient } from '@tanstack/react-query';
import {
  type CalendarSyncResult,
  syncWorkspaceCalendar,
} from '@tuturuuu/internal-api/calendar';

const activeRequests = new WeakMap<
  QueryClient,
  Map<string, Promise<CalendarSyncResult>>
>();

export function isCalendarProviderSyncRunning(
  client: QueryClient,
  wsId: string
) {
  return activeRequests.get(client)?.has(wsId) ?? false;
}

/** Manual, legacy and automatic controls share the same in-flight request. */
export function runCalendarProviderSync(client: QueryClient, wsId: string) {
  let requests = activeRequests.get(client);
  if (!requests) {
    requests = new Map();
    activeRequests.set(client, requests);
  }
  const active = requests.get(wsId);
  if (active) return active;
  const pending = syncWorkspaceCalendar(wsId).finally(() =>
    requests.delete(wsId)
  );
  requests.set(wsId, pending);
  return pending;
}
