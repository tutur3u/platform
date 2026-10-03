import { type calendar_v3, google } from '@tuturuuu/google';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  captureGoogleImport,
  replayDeferredGoogleImports,
  verifiedGoogleImportToken,
} from '@tuturuuu/utils/google-calendar-import-fence';
import { getGoogleCalendarColorContext } from './google-calendar-color-context';
import {
  formatEventForDb,
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
    const client = await createAdminClient({ noCookie: true });
    const scope = {
      wsId: ws_id,
      calendarId,
      authTokenId: await verifiedGoogleImportToken(client, ws_id, access_token),
    };
    const capture = await captureGoogleImport(client, scope);
    const colorContext = await getGoogleCalendarColorContext(
      calendar,
      calendarId
    );
    await replayDeferredGoogleImports({
      client,
      calendar,
      scope,
      format: async (events) =>
        events.map((event) =>
          formatEventForDb(
            event,
            ws_id,
            calendarId,
            colorContext,
            scope.authTokenId
          )
        ),
    });
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
        capture,
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
