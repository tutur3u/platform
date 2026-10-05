import type { calendar_v3 } from '@tuturuuu/google';
import { microsoftCalendarTimeZone } from '@tuturuuu/microsoft/calendar';
import type {
  CalendarRecurrenceAnchor,
  CalendarRecurrenceRule,
} from '@tuturuuu/types/primitives/calendar-recurrence';
import {
  calendarProviderDateTimeLocal,
  fromGoogleCalendarRecurrence,
  fromGraphCalendarRecurrence,
  type GraphCalendarRecurrence,
  inspectCalendarRecurrenceSlot,
  validateCalendarRecurrence,
} from '@tuturuuu/utils/calendar-recurrence';
import type { StoredSeries } from '../../schema';

export type ProviderSeriesObservation = {
  masterId: string;
  etag: string;
  rule: CalendarRecurrenceRule;
  anchor: CalendarRecurrenceAnchor;
  event: { title: string; description: string; location: string | null };
  exceptions: StoredSeries['exceptions'];
};
export interface GraphSeriesEvent {
  id: string;
  '@odata.etag'?: string;
  type: 'seriesMaster' | 'exception' | 'occurrence' | 'singleInstance';
  seriesMasterId?: string;
  originalStart?: string;
  iCalUId?: string;
  originalStartTimeZone?: string;
  subject?: string;
  body?: { content: string; contentType: string };
  location?: { displayName: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  recurrence?: GraphCalendarRecurrence;
}
function requireIdentity(
  id: string | null | undefined,
  etag: string | null | undefined
) {
  if (!id || !etag)
    throw new RangeError(
      'Authoritative provider identity and revision required'
    );
  return { masterId: id, etag };
}
function localGoogle(
  value: calendar_v3.Schema$EventDateTime | null | undefined,
  timeZone: string
) {
  if (value?.date) return `${value.date}T00:00:00`;
  if (!value?.dateTime) throw new RangeError('Provider date-time required');
  return calendarProviderDateTimeLocal(
    { dateTime: value.dateTime, timeZone: value.timeZone ?? undefined },
    timeZone
  );
}
function googleEvent(event: calendar_v3.Schema$Event) {
  return {
    title: event.summary ?? '',
    description: event.description ?? '',
    location: event.location ?? null,
  };
}
function graphEvent(event: GraphSeriesEvent) {
  return {
    title: event.subject ?? '',
    description: event.body?.content ?? '',
    location: event.location?.displayName ?? null,
  };
}
function uniqueExceptions(exceptions: StoredSeries['exceptions']) {
  if (
    exceptions.length > 1000 ||
    new Set(exceptions.map((value) => value.originalStartLocal)).size !==
      exceptions.length
  )
    throw new RangeError('Incomplete or duplicate provider exception snapshot');
  return exceptions;
}
/** Non-expanded master/exception snapshots only. Generated occurrences are
 * never mistaken for overrides, and moved instances retain original identity. */
export function observeGoogleSeries(
  master: calendar_v3.Schema$Event,
  exceptions: calendar_v3.Schema$Event[],
  calendarTimeZone?: string
): ProviderSeriesObservation {
  if (
    master.status === 'cancelled' ||
    master.recurringEventId ||
    !master.recurrence
  )
    throw new RangeError('Active recurring master required');
  const identity = requireIdentity(master.id, master.etag);
  const timeZone = master.start?.timeZone ?? calendarTimeZone;
  if (!timeZone) throw new RangeError('Authoritative series timezone required');
  const anchor = {
    startLocal: localGoogle(master.start, timeZone),
    endLocal: localGoogle(master.end, timeZone),
    allDay: !!master.start?.date,
  };
  const rule = fromGoogleCalendarRecurrence(
    master.recurrence,
    anchor,
    timeZone
  );
  validateCalendarRecurrence(rule, anchor);
  return {
    ...identity,
    rule,
    anchor,
    event: googleEvent(master),
    exceptions: uniqueExceptions(
      exceptions.map((event) => {
        if (
          event.recurringEventId !== identity.masterId ||
          !event.originalStartTime
        )
          throw new RangeError('Exception belongs to another series');
        const originalStartLocal = localGoogle(
          event.originalStartTime,
          timeZone
        );
        inspectCalendarRecurrenceSlot({ rule, anchor, originalStartLocal });
        if (event.status === 'cancelled')
          return {
            originalStartLocal,
            exception: { cancelled: true },
            payload: null,
          };
        if (
          !!event.start?.date !== anchor.allDay ||
          !!event.end?.date !== anchor.allDay
        )
          throw new RangeError('Exception all-day type changed');
        return {
          originalStartLocal,
          exception: {
            startLocal: localGoogle(event.start, timeZone),
            endLocal: localGoogle(event.end, timeZone),
          },
          payload: googleEvent(event),
        };
      })
    ),
  };
}
/** Graph recurrenceTimeZone is authoritative. Custom/unknown timezone names
 * stay unsupported instead of silently falling back to UTC. Cancelled opaque
 * occurrence IDs require separate complete-range reconciliation. */
export function observeGraphSeries(
  master: GraphSeriesEvent,
  exceptions: GraphSeriesEvent[]
): ProviderSeriesObservation {
  if (
    master.type !== 'seriesMaster' ||
    master.isCancelled ||
    !master.recurrence
  )
    throw new RangeError('Active recurring master required');
  const identity = requireIdentity(master.id, master['@odata.etag']);
  const timeZone = microsoftCalendarTimeZone(
    master.recurrence.range.recurrenceTimeZone ??
      master.originalStartTimeZone ??
      master.start.timeZone
  );
  const providerDateTime = (value: GraphSeriesEvent['start']) => ({
    ...value,
    timeZone: microsoftCalendarTimeZone(value.timeZone),
  });
  const anchor = {
    startLocal: calendarProviderDateTimeLocal(
      providerDateTime(master.start),
      timeZone
    ),
    endLocal: calendarProviderDateTimeLocal(
      providerDateTime(master.end),
      timeZone
    ),
    allDay: !!master.isAllDay,
  };
  const rule = fromGraphCalendarRecurrence(
    {
      ...master.recurrence,
      range: { ...master.recurrence.range, recurrenceTimeZone: timeZone },
    },
    timeZone
  );
  validateCalendarRecurrence(rule, anchor);
  return {
    ...identity,
    rule,
    anchor,
    event: graphEvent(master),
    exceptions: uniqueExceptions(
      exceptions.map((event) => {
        if (
          event.type !== 'exception' ||
          event.seriesMasterId !== identity.masterId ||
          !event.originalStart
        )
          throw new RangeError('Exception belongs to another series');
        const originalStartLocal = calendarProviderDateTimeLocal(
          { dateTime: event.originalStart },
          timeZone
        );
        inspectCalendarRecurrenceSlot({ rule, anchor, originalStartLocal });
        if (event.isCancelled)
          return {
            originalStartLocal,
            exception: { cancelled: true },
            payload: null,
          };
        if (!!event.isAllDay !== anchor.allDay)
          throw new RangeError('Exception all-day type changed');
        return {
          originalStartLocal,
          exception: {
            startLocal: calendarProviderDateTimeLocal(
              providerDateTime(event.start),
              timeZone
            ),
            endLocal: calendarProviderDateTimeLocal(
              providerDateTime(event.end),
              timeZone
            ),
          },
          payload: graphEvent(event),
        };
      })
    ),
  };
}
