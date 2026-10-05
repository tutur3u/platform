import type { calendar_v3 } from '@tuturuuu/google';
import { observeGoogleSeries } from './observation';
import { ProviderSeriesDeletedError } from './snapshot-errors';
import { providerSnapshotRevision } from './snapshot-revision';

/** Read finite non-expanded exceptions, including cancelled/moved instances.
 * Recheck the master revision before accepting the complete snapshot. */
export async function readGoogleSeriesSnapshot(args: {
  api: calendar_v3.Calendar;
  calendarId: string;
  masterId: string;
  authorize: () => Promise<void>;
}) {
  await args.authorize();
  const { data: master } = await args.api.events.get({
    calendarId: args.calendarId,
    eventId: args.masterId,
  });
  if (master.id === args.masterId && master.status === 'cancelled')
    throw new ProviderSeriesDeletedError();
  if (
    master.id !== args.masterId ||
    !master.etag ||
    !master.iCalUID ||
    !master.recurrence ||
    master.status === 'cancelled'
  )
    throw new RangeError('Active authoritative recurring master required');
  let calendarTimeZone = master.start?.timeZone ?? undefined;
  if (!calendarTimeZone) {
    const { data: calendar } = await args.api.calendars.get({
      calendarId: args.calendarId,
    });
    calendarTimeZone = calendar.timeZone ?? undefined;
  }
  const iCalUID = master.iCalUID;
  async function readExceptions() {
    const exceptions: calendar_v3.Schema$Event[] = [];
    const seenTokens = new Set<string>();
    const seenIds = new Set<string>();
    let pageToken: string | undefined;
    for (let page = 0; page < 50; page++) {
      await args.authorize();
      const { data } = await args.api.events.list({
        calendarId: args.calendarId,
        iCalUID,
        singleEvents: false,
        showDeleted: true,
        maxResults: 1000,
        pageToken,
      });
      if (!Array.isArray(data.items))
        throw new RangeError('Malformed provider exception snapshot');
      for (const event of data.items) {
        if (!event.id || seenIds.has(event.id))
          throw new RangeError('Duplicate provider exception identity');
        seenIds.add(event.id);
        if (event.id === master.id) {
          if (event.etag !== master.etag)
            throw new RangeError('Provider series changed during snapshot');
          continue;
        }
        if (event.recurringEventId !== master.id)
          throw new RangeError('Provider exception source changed');
        exceptions.push(event);
        if (exceptions.length > 1000)
          throw new RangeError('Provider exception snapshot exceeds bound');
      }
      pageToken = data.nextPageToken ?? undefined;
      if (!pageToken) break;
      if (seenTokens.has(pageToken) || page === 49)
        throw new RangeError('Incomplete provider exception snapshot');
      seenTokens.add(pageToken);
    }

    return exceptions;
  }
  const exceptions = await readExceptions();
  const repeated = await readExceptions();
  if (
    providerSnapshotRevision(exceptions) !== providerSnapshotRevision(repeated)
  )
    throw new RangeError('Provider exceptions changed during snapshot');
  await args.authorize();
  const { data: verified } = await args.api.events.get({
    calendarId: args.calendarId,
    eventId: args.masterId,
  });
  if (
    verified.id !== master.id ||
    verified.etag !== master.etag ||
    verified.status === 'cancelled'
  )
    throw new RangeError('Provider series changed during snapshot');
  return {
    observation: observeGoogleSeries(master, exceptions, calendarTimeZone),
    master,
    exceptions,
  };
}
