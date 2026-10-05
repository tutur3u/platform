import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import type {
  CalendarRecurrenceAnchor,
  CalendarRecurrenceException,
  CalendarRecurrenceRule,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
export interface CalendarSeriesEventPayload {
  title: string;
  description?: string;
  location?: string | null;
  color?: SupportedColor;
  locked?: boolean;
}
export interface NativeCalendarSeries {
  id: string;
  ws_id: string;
  revision: number;
  workspace_calendar_id: string | null;
  providerSource?: {
    provider: 'google' | 'microsoft';
    connectionId: string;
    externalCalendarId: string;
    externalEventId: string;
  } | null;
  rule: CalendarRecurrenceRule;
  anchor: CalendarRecurrenceAnchor;
  payload: CalendarSeriesEventPayload;
  exceptions: {
    originalStartLocal: string;
    exception: Omit<CalendarRecurrenceException, 'originalStartLocal'>;
    payload: Partial<CalendarSeriesEventPayload> | null;
  }[];
}
export interface CreateNativeCalendarSeriesPayload {
  requestId: string;
  rule: CalendarRecurrenceRule;
  anchor: CalendarRecurrenceAnchor;
  event: CalendarSeriesEventPayload;
  workspaceCalendarId?: string | null;
}
export interface MutateNativeCalendarSeriesPayload {
  requestId: string;
  expectedRevision: number;
  scope: 'this' | 'all' | 'future';
  originalStartLocal?: string;
  event?: Partial<CalendarSeriesEventPayload>;
  rule?: CalendarRecurrenceRule;
  anchor?: CalendarRecurrenceAnchor;
}
export type CalendarSeriesMutationResult =
  | NativeCalendarSeries
  | { id: string; deleted: true; revision: number }
  | {
      previous: NativeCalendarSeries;
      series?: NativeCalendarSeries;
      discardedFutureExceptions: number;
    };
const seriesPath = (wsId: string, seriesId?: string) =>
  `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/series${seriesId ? `/${encodePathSegment(seriesId)}` : ''}`;
type Options = InternalApiClientOptions & { signal?: AbortSignal };
export function listNativeCalendarSeries(wsId: string, options: Options = {}) {
  const { signal, ...clientOptions } = options;
  return getInternalApiClient(clientOptions).json<{
    series: NativeCalendarSeries[];
  }>(seriesPath(wsId), { cache: 'no-store', signal });
}
export function listNativeCalendarOccurrences(
  wsId: string,
  range: { from: string; to: string; limit?: number },
  options: Options = {}
) {
  const { signal, ...clientOptions } = options;
  return getInternalApiClient(clientOptions).json<{ data: CalendarEvent[] }>(
    seriesPath(wsId),
    { query: range, cache: 'no-store', signal }
  );
}
export function getNativeCalendarSeries(
  wsId: string,
  seriesId: string,
  options: Options = {}
) {
  const { signal, ...clientOptions } = options;
  return getInternalApiClient(clientOptions).json<NativeCalendarSeries>(
    seriesPath(wsId, seriesId),
    { cache: 'no-store', signal }
  );
}
export function createNativeCalendarSeries(
  wsId: string,
  payload: CreateNativeCalendarSeriesPayload,
  options: Options = {}
) {
  const { signal, ...clientOptions } = options;
  return getInternalApiClient(clientOptions).json<NativeCalendarSeries>(
    seriesPath(wsId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    }
  );
}
export function mutateNativeCalendarSeries(
  wsId: string,
  seriesId: string,
  payload: MutateNativeCalendarSeriesPayload,
  action: 'update' | 'delete',
  options: Options = {}
) {
  const { signal, ...clientOptions } = options;
  return getInternalApiClient(clientOptions).json<CalendarSeriesMutationResult>(
    seriesPath(wsId, seriesId),
    {
      method: action === 'delete' ? 'DELETE' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    }
  );
}
