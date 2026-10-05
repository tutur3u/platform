'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listNativeCalendarOccurrences } from '@tuturuuu/internal-api/calendar-series';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { useEffect } from 'react';
import { calendarQueryRange } from '../lib/calendar-day';
import { useWorkspaceActor } from './use-workspace-visibility';
export const EMPTY_NATIVE_OCCURRENCES: CalendarEvent[] = [];
export const nativeOccurrencesKey = (wsId: string) =>
  ['native-calendar-occurrences', wsId] as const;
export function deniedNativeOccurrences(error: unknown) {
  return (
    error instanceof InternalApiError &&
    (error.status === 401 ||
      error.status === 404 ||
      (error.status === 403 && error.code !== 'MFA_REQUIRED'))
  );
}
/** A denied snapshot is never rendered as stale data. MFA is a recoverable challenge. */
export function visibleNativeOccurrences(
  data: CalendarEvent[] | undefined,
  error: unknown
) {
  return deniedNativeOccurrences(error)
    ? EMPTY_NATIVE_OCCURRENCES
    : (data ?? EMPTY_NATIVE_OCCURRENCES);
}
export function useNativeCalendarOccurrences(
  wsId: string,
  dates: Date[],
  timezone: string | undefined,
  external: boolean
) {
  const actor = useWorkspaceActor();
  const actorId = actor?.actorId;
  const client = useQueryClient();
  const range = dates.length ? calendarQueryRange(dates, timezone) : undefined;
  const from = range?.start.toISOString();
  const to = range?.end.toISOString();
  const key = [...nativeOccurrencesKey(wsId), actorId, from, to];
  const enabled = !external && !!actor && !!wsId && !!from && !!to;
  useEffect(
    () => () => {
      client.removeQueries({
        queryKey: [...nativeOccurrencesKey(wsId), actorId],
      });
    },
    [client, wsId, actorId]
  );
  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: async ({ signal }) => {
      actor!.assertActive();
      try {
        const result = await listNativeCalendarOccurrences(
          wsId,
          { from: from!, to: to! },
          { signal }
        );
        actor!.assertActive();
        return result.data;
      } catch (error) {
        if (deniedNativeOccurrences(error))
          client.setQueryData(key, EMPTY_NATIVE_OCCURRENCES);
        throw error;
      }
    },
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    retry: (count, error) =>
      !(
        error instanceof InternalApiError &&
        error.status >= 400 &&
        error.status < 500
      ) && count < 2,
  });
  return {
    ...query,
    data: enabled
      ? visibleNativeOccurrences(query.data, query.error)
      : EMPTY_NATIVE_OCCURRENCES,
  };
}
