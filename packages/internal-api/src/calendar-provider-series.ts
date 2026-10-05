import type {
  CalendarSeriesMutationResult,
  CreateNativeCalendarSeriesPayload,
  MutateNativeCalendarSeriesPayload,
} from './calendar-series';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
export type CalendarProviderSeriesSource = {
  provider: 'google' | 'microsoft';
  connectionId: string;
};
export type CalendarProviderSeriesOperationPayload =
  | (CreateNativeCalendarSeriesPayload & {
      action: 'create';
      source: CalendarProviderSeriesSource;
    })
  | (MutateNativeCalendarSeriesPayload & {
      action: 'update' | 'delete';
      source: CalendarProviderSeriesSource;
      seriesId: string;
    });
export type CalendarProviderSeriesOperationResult =
  | { operationId: string; status: 'pending' }
  | {
      operationId: string;
      status: 'applied';
      result: CalendarSeriesMutationResult;
    };
type Options = InternalApiClientOptions & { signal?: AbortSignal };
const path = (wsId: string, operationId?: string) =>
  `/api/v1/workspaces/${encodePathSegment(wsId)}/calendar/series/provider-operations${operationId ? `/${encodePathSegment(operationId)}` : ''}`;
export function reserveCalendarProviderSeriesOperation(
  wsId: string,
  payload: CalendarProviderSeriesOperationPayload,
  options: Options = {}
) {
  const { signal, ...clientOptions } = options;
  return getInternalApiClient(
    clientOptions
  ).json<CalendarProviderSeriesOperationResult>(path(wsId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
}
export function getCalendarProviderSeriesOperation(
  wsId: string,
  operationId: string,
  options: Options = {}
) {
  const { signal, ...clientOptions } = options;
  return getInternalApiClient(
    clientOptions
  ).json<CalendarProviderSeriesOperationResult>(path(wsId, operationId), {
    cache: 'no-store',
    signal,
  });
}
export function retryCalendarProviderSeriesOperation(
  wsId: string,
  operationId: string,
  options: Options = {}
) {
  const { signal, ...clientOptions } = options;
  return getInternalApiClient(
    clientOptions
  ).json<CalendarProviderSeriesOperationResult>(path(wsId, operationId), {
    method: 'POST',
    signal,
  });
}
