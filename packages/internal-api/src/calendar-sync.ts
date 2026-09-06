import type { ProviderCalendar } from './calendar';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

type ProviderCalendarEntry = Required<ProviderCalendar>;

export interface ProviderCalendarsResponse {
  accounts: Array<{
    id: string;
    provider?: string;
    email?: string | null;
    name?: string | null;
  }>;
  byAccount: Record<string, ProviderCalendarEntry[]>;
  calendars: ProviderCalendarEntry[];
  accountStatuses?: Record<
    string,
    { state: 'connected' | 'reconnect_required' | 'temporarily_unavailable' }
  >;
}

export interface CalendarSyncHealth {
  state: 'paused' | 'disconnected' | 'syncing' | 'healthy' | 'degraded';
  reason: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  currentlyRunning: boolean;
  retryAfterSeconds: number | null;
}

export interface CalendarSyncStatusResponse {
  health: CalendarSyncHealth;
  accountsSummary: { total: number; google: number; microsoft: number };
  connectionsSummary: { total: number; enabled: number };
}

export interface CalendarSyncResult {
  ok: boolean;
  alreadyRunning?: boolean;
  partialFailure?: boolean;
  code?: string;
  retryAfterSeconds?: number | null;
}

export function getWorkspaceCalendarSyncStatus(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<CalendarSyncStatusResponse>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/sync-status`,
    { cache: 'no-store' }
  );
}

export function syncWorkspaceCalendar(
  wsId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<CalendarSyncResult>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/sync`,
    {
      method: 'POST',
      body: JSON.stringify({ direction: 'inbound', source: 'manual' }),
    }
  );
}
