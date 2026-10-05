import type { createGraphClient } from '@tuturuuu/microsoft';
import { fetchCalendarViewPages } from '@tuturuuu/microsoft/calendar';
import {
  calendarProviderDateTimeLocal,
  expandCalendarRecurrence,
  inspectCalendarRecurrenceSlot,
  UnsupportedCalendarRecurrenceError,
} from '@tuturuuu/utils/calendar-recurrence';
import {
  type GraphSeriesEvent,
  observeGraphSeries,
  type ProviderSeriesObservation,
} from './observation';
import {
  ProviderSeriesDeletedError,
  ProviderSeriesUnsupportedError,
} from './snapshot-errors';
import { providerSnapshotRevision } from './snapshot-revision';

/** Infer only cancellations covered by a complete bounded provider view.
 * Full master exceptions prevent moved-out instances from becoming cancellations. */
export function graphCancellationsInRange(
  observation: ProviderSeriesObservation,
  events: GraphSeriesEvent[],
  from: string,
  to: string
) {
  const exceptions = new Map(
    observation.exceptions.map((value) => [value.originalStartLocal, value])
  );
  const expansion = expandCalendarRecurrence({
    rule: observation.rule,
    anchor: observation.anchor,
    from,
    to,
    exceptions: observation.exceptions.map((value) => ({
      originalStartLocal: value.originalStartLocal,
      ...value.exception,
    })),
    limit: 1000,
  });
  if (expansion.truncated)
    throw new RangeError('Provider range exceeds recurrence bound');
  const present = new Set<string>();
  for (const event of events) {
    if (event.seriesMasterId !== observation.masterId) continue;
    if (
      !event.originalStart ||
      !['occurrence', 'exception'].includes(event.type)
    )
      throw new RangeError('Provider range occurrence identity missing');
    const slot = calendarProviderDateTimeLocal(
      { dateTime: event.originalStart },
      observation.rule.timeZone
    );
    inspectCalendarRecurrenceSlot({
      rule: observation.rule,
      anchor: observation.anchor,
      originalStartLocal: slot,
    });
    if (present.has(slot))
      throw new RangeError('Duplicate provider range occurrence');
    present.add(slot);
    if (event.isCancelled)
      exceptions.set(slot, {
        originalStartLocal: slot,
        exception: { cancelled: true },
        payload: null,
      });
    else {
      const override = exceptions.get(slot);
      const expected = expansion.occurrences.find(
        (value) => value.originalStartLocal === slot
      );
      if (event.type === 'exception' && !override)
        throw new RangeError('Incomplete master exception snapshot');
      if (
        expected &&
        (calendarProviderDateTimeLocal(
          event.start,
          observation.rule.timeZone
        ) !==
          calendarProviderDateTimeLocal(
            { dateTime: expected.start_at },
            observation.rule.timeZone
          ) ||
          calendarProviderDateTimeLocal(
            event.end,
            observation.rule.timeZone
          ) !==
            calendarProviderDateTimeLocal(
              { dateTime: expected.end_at },
              observation.rule.timeZone
            ))
      )
        throw new RangeError('Provider occurrence differs from canonical rule');
    }
  }
  for (const occurrence of expansion.occurrences) {
    if (!present.has(occurrence.originalStartLocal))
      exceptions.set(occurrence.originalStartLocal, {
        originalStartLocal: occurrence.originalStartLocal,
        exception: { cancelled: true },
        payload: null,
      });
  }
  if (exceptions.size > 1000)
    throw new RangeError('Provider exception snapshot exceeds bound');
  return [...exceptions.values()];
}

export async function readGraphSeriesSnapshot(args: {
  api: ReturnType<typeof createGraphClient>;
  calendarId: string;
  masterId: string;
  from: string;
  to: string;
  authorize: () => Promise<void>;
  completeView?: {
    calendarId: string;
    from: string;
    to: string;
    events: GraphSeriesEvent[];
    verificationEvents: GraphSeriesEvent[];
  };
}) {
  const path = `/me/calendars/${encodeURIComponent(args.calendarId)}/events/${encodeURIComponent(args.masterId)}`;
  const request = () =>
    args.api
      .api(path)
      .header('Prefer', 'IdType="ImmutableId", outlook.timezone="UTC"');
  await args.authorize();
  const readMaster = async () =>
    (await request()
      .query({
        $select:
          'id,subject,body,location,start,end,isAllDay,isCancelled,type,recurrence,originalStartTimeZone,exceptionOccurrences,cancelledOccurrences,attendees,organizer,responseRequested,isOrganizer,isOnlineMeeting,onlineMeetingProvider,onlineMeeting,isReminderOn,reminderMinutesBeforeStart,sensitivity,showAs,categories,hasAttachments',
        $expand: 'exceptionOccurrences',
      })
      .get()) as GraphSeriesEvent & {
      exceptionOccurrences?: GraphSeriesEvent[];
      'exceptionOccurrences@odata.nextLink'?: string;
      cancelledOccurrences?: string[];
    };
  const master = await readMaster();
  if (master.id === args.masterId && master.isCancelled)
    throw new ProviderSeriesDeletedError();
  if (
    master.id !== args.masterId ||
    typeof master['@odata.etag'] !== 'string' ||
    !master['@odata.etag'] ||
    !Array.isArray(master.exceptionOccurrences) ||
    master.exceptionOccurrences.length > 1000 ||
    master['exceptionOccurrences@odata.nextLink']
  )
    throw new RangeError('Incomplete provider master exception snapshot');
  await args.authorize();
  if (
    args.completeView &&
    (args.completeView.calendarId !== args.calendarId ||
      args.completeView.from !== args.from ||
      args.completeView.to !== args.to)
  )
    throw new RangeError('Provider complete view scope changed');
  const events =
    args.completeView?.events ??
    (await fetchCalendarViewPages<GraphSeriesEvent>(
      args.api,
      args.calendarId,
      args.from,
      args.to,
      { immutableIds: true, beforeRead: args.authorize }
    ));
  // Re-read the complete view and expanded exceptions: a master ETag alone
  // cannot fence individual occurrence edits or cancellation during pagination.
  const repeated =
    args.completeView?.verificationEvents ??
    (await fetchCalendarViewPages<GraphSeriesEvent>(
      args.api,
      args.calendarId,
      args.from,
      args.to,
      { immutableIds: true, beforeRead: args.authorize }
    ));
  if (
    providerSnapshotRevision(
      events.filter((event) => event.seriesMasterId === master.id)
    ) !==
    providerSnapshotRevision(
      repeated.filter((event) => event.seriesMasterId === master.id)
    )
  )
    throw new RangeError('Provider occurrences changed during snapshot');
  await args.authorize();
  const verified = await readMaster();
  if (
    verified.id !== master.id ||
    verified['@odata.etag'] !== master['@odata.etag'] ||
    verified.isCancelled ||
    !Array.isArray(verified.exceptionOccurrences) ||
    verified['exceptionOccurrences@odata.nextLink'] ||
    providerSnapshotRevision(master.exceptionOccurrences!) !==
      providerSnapshotRevision(verified.exceptionOccurrences)
  )
    throw new RangeError('Provider series changed during snapshot');
  let observation: ProviderSeriesObservation;
  try {
    observation = observeGraphSeries(master, master.exceptionOccurrences!);
  } catch (error) {
    if (error instanceof UnsupportedCalendarRecurrenceError)
      throw new ProviderSeriesUnsupportedError({
        provider: 'microsoft',
        masterId: args.masterId,
        etag: String(master['@odata.etag']),
        master: master as unknown as Record<string, unknown>,
        exceptions: master.exceptionOccurrences as unknown as Record<
          string,
          unknown
        >[],
      });
    throw error;
  }
  return {
    observation: {
      ...observation,
      exceptions: graphCancellationsInRange(
        observation,
        events,
        args.from,
        args.to
      ),
    },
    master,
    coverage: { from: args.from, to: args.to },
    events,
  };
}
