import type { ProviderCalendar } from './calendar';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

type ProviderCalendarEntry = Required<ProviderCalendar>;

type CalendarProviderAccountIssue = 'configuration' | 'status_unknown';

export type CalendarProviderAccountState =
  | 'connected'
  | 'reconnect_required'
  | 'scope_required'
  | 'temporarily_unavailable'
  | CalendarProviderAccountIssue
  | 'removed';

export type CalendarProviderAccountStatusPayload =
  | { state: 'temporarily_unavailable'; issue?: CalendarProviderAccountIssue }
  | {
      state: Exclude<
        CalendarProviderAccountState,
        CalendarProviderAccountIssue | 'temporarily_unavailable'
      >;
    };

export interface ProviderCalendarsResponse {
  accounts: Array<{
    id: string;
    provider?: string;
    email?: string | null;
    name?: string | null;
  }>;
  byAccount: Record<string, ProviderCalendarEntry[]>;
  calendars: ProviderCalendarEntry[];
  accountStatuses?: Record<string, { state: CalendarProviderAccountState }>;
}

export type ProviderCalendarsPayload = Omit<
  ProviderCalendarsResponse,
  'accountStatuses'
> & {
  accountStatuses?: Record<string, CalendarProviderAccountStatusPayload>;
};

export async function listProviderCalendars(
  wsId: string,
  query?: { accountId?: string },
  options?: InternalApiClientOptions
): Promise<ProviderCalendarsResponse> {
  const client = getInternalApiClient(options);
  const response = await client.json<ProviderCalendarsPayload>(
    '/api/v1/calendar/auth/provider-calendars',
    {
      query: { wsId, accountId: query?.accountId },
      cache: 'no-store',
    }
  );
  if (!response.accountStatuses) return response;
  return {
    ...response,
    accountStatuses: Object.fromEntries(
      Object.entries(response.accountStatuses).map(([id, status]) => [
        id,
        {
          state:
            status.state === 'temporarily_unavailable'
              ? (status.issue ?? status.state)
              : status.state,
        },
      ])
    ),
  };
}

export interface CalendarSyncHealth {
  state: 'paused' | 'disconnected' | 'syncing' | 'healthy' | 'degraded';
  reason: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  currentlyRunning: boolean;
  retryAfterSeconds: number | null;
}

export interface CalendarSyncFailure {
  connectionId: string;
  calendarName: string;
  code: string;
}

export interface CalendarSyncStatusResponse {
  failedCalendars?: CalendarSyncFailure[];
  health: CalendarSyncHealth;
  accountsSummary: { total: number; google: number; microsoft: number };
  connectionsSummary: { total: number; enabled: number };
}

export interface CalendarSyncResult {
  ok: boolean;
  error?: string;
  summary?: {
    google?: {
      inserted?: number;
      updated?: number;
      deleted?: number;
      failedCalendars?: CalendarSyncFailure[];
    };
    microsoft?: { inserted?: number; updated?: number; deleted?: number };
  };
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
  options?: InternalApiClientOptions,
  payload: { direction?: 'inbound' | 'outbound' | 'both' } = {}
) {
  return getInternalApiClient(options).json<CalendarSyncResult>(
    `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/sync`,
    {
      method: 'POST',
      body: JSON.stringify({
        direction: payload.direction ?? 'inbound',
        source: 'manual',
      }),
    }
  );
}
