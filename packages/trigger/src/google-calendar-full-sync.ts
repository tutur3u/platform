import { type calendar_v3, google } from '@tuturuuu/google';
import dayjs from 'dayjs';
import {
  getGoogleAuthClient,
  storeSyncToken,
  syncWorkspaceBatched,
} from './google-calendar-sync';

export async function performFullSyncForWorkspace(
  calendarId = 'primary',
  ws_id: string,
  access_token: string,
  refresh_token: string
) {
  console.log('Starting full sync for workspace', { wsId: ws_id });

  const auth = getGoogleAuthClient({
    access_token,
    refresh_token: refresh_token || undefined,
  });
  const calendarAuth = auth as unknown as calendar_v3.Options['auth'];
  const calendar = google.calendar({ version: 'v3', auth: calendarAuth });

  const now = dayjs();
  // Expand date range to include past events and future events
  const timeMin = now.subtract(90, 'day'); // 90 days in the past
  const timeMax = now.add(180, 'day'); // 180 days in the future

  console.log('Fetching events with date range:', {
    wsId: ws_id,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    dateRange: `${timeMin.format('YYYY-MM-DD')} to ${timeMax.format('YYYY-MM-DD')}`,
    totalDays: timeMax.diff(timeMin, 'day'),
  });

  try {
    const res = await calendar.events.list({
      calendarId,
      showDeleted: true,
      singleEvents: true,
      maxResults: 2500,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
    });

    const events = res.data.items || [];
    const syncToken = res.data.nextSyncToken;

    console.log('Google Calendar API response:', {
      wsId: ws_id,
      eventsCount: events.length,
      hasNextSyncToken: !!syncToken,
      hasNextPageToken: !!res.data.nextPageToken,
      timeZone: res.data.timeZone,
    });

    // Log sample events for debugging
    if (events.length > 0) {
      console.log('Sample events:', {
        wsId: ws_id,
        events: events.slice(0, 3).map((event) => ({
          id: event.id,
          summary: event.summary,
          start: event.start,
          end: event.end,
          status: event.status,
        })),
      });
    }

    if (events.length > 0) {
      console.log(`Processing ${events.length} events...`, { wsId: ws_id });
      await syncWorkspaceBatched({ ws_id, events_to_sync: events });
      console.log(`Successfully synced ${events.length} events to database`, {
        wsId: ws_id,
      });
    } else {
      console.log('No events found in the specified date range', {
        wsId: ws_id,
      });
    }

    if (syncToken) {
      console.log('Storing sync tokens...', { wsId: ws_id });
      await storeSyncToken(ws_id, syncToken, new Date(), calendarId);
      console.log('Sync tokens stored successfully', { wsId: ws_id });
    } else {
      console.log('No sync token received from Google Calendar API', {
        wsId: ws_id,
      });
    }

    return events;
  } catch (error) {
    console.error('Error during full sync:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ws_id,
      calendarId,
    });
    throw error;
  }
}
