import {
  formatEventForDb,
  getActiveSyncToken,
  getGoogleAuthClient,
  storeActiveSyncToken,
  syncWorkspaceBatched,
} from '@tuturuuu/trigger/google-calendar-sync';
import { google } from 'googleapis';

/**
 * Filters events by date range and status using a pipe pattern
 */
function filterEventsByDateAndStatus(
  events: calendar_v3.Schema$Event[],
  startDate: Date,
  endDate: Date
) {
  return events
    .filter((event) => {
      // Filter by date range first
      const eventStart = event.start?.dateTime
        ? new Date(event.start.dateTime)
        : event.start?.date
          ? new Date(event.start.date)
          : null;

      const eventEnd = event.end?.dateTime
        ? new Date(event.end.dateTime)
        : event.end?.date
          ? new Date(event.end.date)
          : null;

      // If event has no start date, exclude it
      if (!eventStart) return false;

      // Check if event overlaps with the date range
      const eventEndTime = eventEnd || eventStart;
      return eventStart <= endDate && eventEndTime >= startDate;
    })
    .reduce(
      (acc, event) => {
        // Then filter by status
        if (event.status === 'cancelled') {
          acc.eventsToDelete.push(event);
        } else {
          acc.eventsToUpsert.push(event);
        }
        return acc;
      },
      {
        eventsToUpsert: [] as calendar_v3.Schema$Event[],
        eventsToDelete: [] as calendar_v3.Schema$Event[],
      }
    );
}

export async function performIncrementalActiveSync(
  wsId: string,
  calendarId: string = 'primary',
  access_token: string,
  refresh_token: string,
  startDate: Date,
  endDate: Date
) {
  const auth = getGoogleAuthClient({
    access_token,
    refresh_token: refresh_token || undefined,
  });
  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const syncToken = await getActiveSyncToken(wsId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allEvents: any[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const res = await calendar.events.list({
        calendarId,
        syncToken: syncToken || undefined,
        showDeleted: true,
        singleEvents: true,
        pageToken,
        maxResults: 2500,
      });
      const events = res.data.items || [];
      allEvents = allEvents.concat(events);
      nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    if (allEvents.length > 0) {
      await incrementalActiveSync(wsId, allEvents, startDate, endDate);
    }

    if (nextSyncToken) {
      await storeActiveSyncToken(wsId, nextSyncToken, new Date());
    }

    return allEvents;
  } catch (error) {
    console.error('Error fetching sync token:', error);
    throw error;
  }
}

async function incrementalActiveSync(
  wsId: string,
  eventsToSync: calendar_v3.Schema$Event[],
  startDate: Date,
  endDate: Date
) {
  // Use the pipe to filter events by date range first, then by status
  const { eventsToUpsert, eventsToDelete } = filterEventsByDateAndStatus(
    eventsToSync,
    startDate,
    endDate
  );

  const formattedEventsToUpsert = eventsToUpsert.map((event) => {
    return formatEventForDb(event, wsId);
  });

  const formattedEventsToDelete = eventsToDelete.map((event) => {
    return formatEventForDb(event, wsId);
  });

  return { formattedEventsToUpsert, formattedEventsToDelete };
}
