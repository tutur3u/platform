import { type calendar_v3, google } from '@tuturuuu/google';
import { getGoogleCalendarColorContext } from './google-calendar-color-context';
import {
  getGoogleAuthClient,
  getSyncToken,
  storeSyncToken,
  syncWorkspaceBatched,
} from './google-calendar-sync';

export async function performIncrementalSyncForWorkspace(
  calendarId = 'primary',
  ws_id: string,
  access_token: string,
  refresh_token: string
) {
  const auth = getGoogleAuthClient({
    access_token,
    refresh_token: refresh_token || undefined,
  });
  const calendarAuth = auth as unknown as calendar_v3.Options['auth'];
  const calendar = google.calendar({ version: 'v3', auth: calendarAuth });

  try {
    const colorContext = await getGoogleCalendarColorContext(
      calendar,
      calendarId
    );
    const syncToken = await getSyncToken(ws_id, calendarId);
    let allEvents: calendar_v3.Schema$Event[] = [];
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
      const result = await syncWorkspaceBatched({
        ws_id,
        events_to_sync: allEvents,
        calendarId,
        colorContext,
        preserveExistingMetadata: true,
      });
      if (!result.success)
        throw new Error(result.error ?? 'Google calendar batch sync failed');
    }

    if (nextSyncToken) {
      await storeSyncToken(ws_id, nextSyncToken, new Date(), calendarId);
    }

    return allEvents;
  } catch (error) {
    console.error('Error fetching sync token:', error);
    throw error;
  }
}
