import type { createGraphClient } from '@tuturuuu/microsoft';
import {
  fetchCalendarViewPages,
  type MicrosoftCalendarEvent,
} from '@tuturuuu/microsoft/calendar';
import {
  expandCalendarRecurrence,
  UnsupportedCalendarRecurrenceError,
} from '@tuturuuu/utils/calendar-recurrence';
import { CalendarSeriesError } from '../../service';
import { verifyGraphLegacySeriesIdentities } from './graph-legacy-identities';
import { readGraphSeriesSnapshot } from './graph-snapshot';
import type { GraphSeriesEvent } from './observation';
import {
  type InboundProviderAccess,
  prepareInboundProviderConnection,
} from './service';
import { ProviderSeriesDeletedError } from './snapshot-errors';

export async function reconcileGraphConnectionSeries(args: {
  access: InboundProviderAccess;
  api: ReturnType<typeof createGraphClient>;
  from: string;
  to: string;
  legacyEvents: MicrosoftCalendarEvent[];
}) {
  if (process.env.CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED !== 'true')
    return args.legacyEvents;
  const service = await prepareInboundProviderConnection(args.access);
  const events = await fetchCalendarViewPages<GraphSeriesEvent>(
    args.api,
    args.access.calendarId,
    args.from,
    args.to,
    { immutableIds: true, beforeRead: service.authorize }
  );
  const verificationEvents = await fetchCalendarViewPages<GraphSeriesEvent>(
    args.api,
    args.access.calendarId,
    args.from,
    args.to,
    { immutableIds: true, beforeRead: service.authorize }
  );
  const masters = new Set(
    events.flatMap((event) =>
      event.seriesMasterId
        ? [event.seriesMasterId]
        : event.type === 'seriesMaster'
          ? [event.id]
          : []
    )
  );
  // A complete view can contain no rows when every slot was cancelled or the
  // master was deleted. Recheck relevant retained masters rather than treating
  // that absence as an empty native series forever.
  for (const binding of service.bindings) {
    const expanded = expandCalendarRecurrence({
      rule: binding.series.rule,
      anchor: binding.series.anchor,
      from: args.from,
      to: args.to,
      limit: 1,
    });
    if (expanded.occurrences.length) masters.add(binding.master_id);
  }
  if (masters.size > 1000)
    throw new RangeError('Provider recurrence master bound exceeded');
  const persistedIdentities = await verifyGraphLegacySeriesIdentities({
    access: args.access,
    api: args.api,
    masters,
    authorize: service.authorize,
  });
  const handled = new Set<string>();
  for (const masterId of masters) {
    try {
      const snapshot = await readGraphSeriesSnapshot({
        api: args.api,
        calendarId: args.access.calendarId,
        masterId,
        from: args.from,
        to: args.to,
        authorize: service.authorize,
        completeView: {
          calendarId: args.access.calendarId,
          from: args.from,
          to: args.to,
          events,
          verificationEvents,
        },
      });
      const represented = events.filter(
        (event) => event.id === masterId || event.seriesMasterId === masterId
      );
      const uids = new Set(
        represented.flatMap((event) => (event.iCalUId ? [event.iCalUId] : []))
      );
      const mutable = args.legacyEvents.filter(
        (event) => event.iCalUId && uids.has(event.iCalUId)
      );
      if (
        represented.some((event) => !event.iCalUId) ||
        uids.size !== represented.length ||
        new Set(mutable.map((event) => event.iCalUId)).size !==
          mutable.length ||
        mutable.length !== represented.length
      )
        throw new RangeError('Provider mutable identity bridge incomplete');
      await service.publish({
        observation: snapshot.observation,
        master: snapshot.master as unknown as Record<string, unknown>,
        rawExceptions: snapshot.master
          .exceptionOccurrences as unknown as Record<string, unknown>[],
        representedInstanceIds: [
          ...new Set([
            ...represented.map((event) => event.id),
            ...mutable.map((event) => event.id),
            ...(persistedIdentities.get(masterId) ?? []),
          ]),
        ],
        coverage: snapshot.coverage,
      });
      for (const event of mutable) handled.add(event.id);
    } catch (error) {
      const bound = service.bindings.some(
        (value) => value.master_id === masterId
      );
      const status = (error as { statusCode?: number })?.statusCode;
      if (
        bound &&
        (status === 404 || error instanceof ProviderSeriesDeletedError)
      ) {
        await service.deleted(masterId);
        continue;
      }
      if (
        !bound &&
        (error instanceof RangeError ||
          error instanceof UnsupportedCalendarRecurrenceError)
      )
        continue;
      if (error instanceof CalendarSeriesError) throw error;
      throw new CalendarSeriesError(
        'Provider recurring snapshot unavailable',
        503,
        'PROVIDER_SNAPSHOT_UNAVAILABLE'
      );
    }
  }
  return args.legacyEvents.filter((event) => !handled.has(event.id));
}
