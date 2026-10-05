import type { calendar_v3 } from '@tuturuuu/google';
import { google } from '@tuturuuu/google';
import { createGraphClient } from '@tuturuuu/microsoft';
import { calendarRecurrenceSlotInstant } from '@tuturuuu/utils/calendar-recurrence';
import { createGoogleAuthClient } from '../../provider-writes';
import type { ResolvedCalendarSource } from '../../source-resolver';
import type { ProviderSeriesSnapshot } from './payload';

export function createSeriesProviderInspector(source: ResolvedCalendarSource) {
  if (source.provider === 'tuturuuu' || !source.accessToken)
    throw new Error('Provider credentials unavailable');
  const external = source;
  const calendar =
    source.provider === 'google'
      ? google.calendar({ version: 'v3', auth: createGoogleAuthClient(source) })
      : null;
  const graph =
    source.provider === 'microsoft'
      ? createGraphClient(source.accessToken)
      : null;
  const path = (id: string) =>
    `/me/calendars/${encodeURIComponent(external.externalCalendarId)}/events/${encodeURIComponent(id)}`;
  const read = async (id: string) =>
    calendar
      ? (
          await calendar.events.get({
            calendarId: external.externalCalendarId,
            eventId: id,
          })
        ).data
      : await graph!
          .api(path(id))
          .header('Prefer', 'IdType="ImmutableId", outlook.timezone="UTC"')
          .get();
  return {
    async master(masterId: string) {
      const event = await read(masterId);
      if (
        event.id !== masterId ||
        event.status === 'cancelled' ||
        event.isCancelled === true ||
        (calendar
          ? !event.recurrence?.length || !!event.recurringEventId
          : event.type !== 'seriesMaster')
      )
        throw new Error('Provider series master unavailable');
      const etag = calendar ? event.etag : event['@odata.etag'];
      if (typeof etag !== 'string')
        throw new Error('Provider revision unavailable');
      return { event, etag };
    },
    async instance(
      masterId: string,
      current: ProviderSeriesSnapshot,
      originalStartLocal: string
    ) {
      const originalInstant = calendarRecurrenceSlotInstant({
        ...current,
        originalStartLocal,
      });
      const matches = (event: Record<string, any>) =>
        calendar
          ? event.recurringEventId === masterId &&
            (current.anchor.allDay
              ? event.originalStartTime?.date ===
                originalStartLocal.slice(0, 10)
              : Date.parse(event.originalStartTime?.dateTime) ===
                Date.parse(originalInstant))
          : event.seriesMasterId === masterId &&
            Date.parse(event.originalStart) === Date.parse(originalInstant);
      let candidates: Record<string, any>[] = [];
      if (calendar) {
        const seen = new Set<string>();
        let pageToken: string | undefined;
        for (let page = 0; page < 50; page++) {
          const response: { data: calendar_v3.Schema$Events } =
            await calendar.events.instances({
              calendarId: external.externalCalendarId,
              eventId: masterId,
              originalStart: current.anchor.allDay
                ? originalStartLocal.slice(0, 10)
                : originalInstant,
              showDeleted: true,
              maxResults: 2500,
              pageToken,
            });
          candidates.push(...(response.data.items ?? []));
          pageToken = response.data.nextPageToken ?? undefined;
          if (!pageToken) break;
          if (page === 49 || seen.has(pageToken))
            throw new Error('Provider instance pagination limit');
          seen.add(pageToken);
        }
      } else {
        const time = Date.parse(originalInstant);
        const response = await graph!
          .api(`${path(masterId)}/instances`)
          .header('Prefer', 'IdType="ImmutableId", outlook.timezone="UTC"')
          .query({
            startDateTime: new Date(time - 86400000).toISOString(),
            endDateTime: new Date(time + 86400000).toISOString(),
            $top: 1000,
          })
          .get();
        if (!Array.isArray(response?.value) || response['@odata.nextLink'])
          throw new Error('Provider occurrence lookup exceeds bounds');
        candidates = response.value;
        if (!candidates.some(matches)) {
          // A moved exception may lie outside the original slot's window.
          const master = await graph!
            .api(path(masterId))
            .header('Prefer', 'IdType="ImmutableId", outlook.timezone="UTC"')
            .query({
              $select: 'id,exceptionOccurrences',
              $expand:
                'exceptionOccurrences($select=id,originalStart,seriesMasterId)',
            })
            .get();
          if (
            !Array.isArray(master.exceptionOccurrences) ||
            master['exceptionOccurrences@odata.nextLink'] ||
            master.exceptionOccurrences.length > 1000
          )
            throw new Error('Provider exception lookup exceeds bounds');
          const matching = master.exceptionOccurrences.filter(matches);
          if (matching.length === 1)
            candidates.push(await read(matching[0].id));
        }
      }
      const found = candidates.filter(matches);
      if (found.length !== 1 || typeof found[0]?.id !== 'string')
        throw new Error('Provider occurrence identity unavailable');
      const event = found[0]!;
      const etag = calendar ? event.etag : event['@odata.etag'];
      if (typeof etag !== 'string')
        throw new Error('Provider occurrence revision unavailable');
      return { event, instanceId: event.id as string, instanceETag: etag };
    },
  };
}
