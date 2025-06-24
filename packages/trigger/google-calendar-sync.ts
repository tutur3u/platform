import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceCalendarEvent } from '@tuturuuu/types/db';
import {
  BACKGROUND_SYNC_RANGE,
  updateLastUpsert,
} from '@tuturuuu/utils/calendar-sync-coordination';
import dayjs from 'dayjs';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

const getGoogleAuthClient = (tokens: {
  access_token: string;
  refresh_token?: string;
}) => {
  const oauth2Client = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });

  oauth2Client.setCredentials(tokens);
  return oauth2Client;
};

const getColorFromGoogleColorId = (colorId?: string): string => {
  const colorMap: Record<string, string> = {
    '1': 'RED',
    '2': 'GREEN',
    '3': 'GRAY',
    '4': 'PINK',
    '5': 'YELLOW',
    '6': 'ORANGE',
    '8': 'CYAN',
    '9': 'PURPLE',
    '10': 'INDIGO',
    '11': 'BLUE',
  };
  return colorId && colorMap[colorId] ? colorMap[colorId] : 'BLUE';
};

export const syncGoogleCalendarEvents = async () => {
  try {
    const supabase = await createAdminClient({ noCookie: true });

    // Fetch all wsId with auth tokens not null
    const { data: tokens, error } = await supabase
      .from('calendar_auth_tokens')
      .select('ws_id, access_token, refresh_token');

    if (error) {
      console.error('Error fetching auth tokens:', error);
      return [];
    }

    console.log(
      'Synchronizing Google Calendar events for',
      tokens.length,
      'wsIds',
      tokens.map((token) => token.ws_id)
    );

    const endSync = async (
      ws_id: string,
      googleAccountEmail: string | null,
      syncStartedAt: string,
      syncEndedAt: string,
      status: string,
      errorMessage: string,
      eventSnapshotBefore: WorkspaceCalendarEvent[],
      upsertedEvents: WorkspaceCalendarEvent[],
      deletedEvents: WorkspaceCalendarEvent[]
    ) => {
      await supabase.from('workspace_calendar_sync_log').insert({
        ws_id,
        google_account_email: googleAccountEmail,
        sync_started_at: syncStartedAt,
        sync_ended_at: syncEndedAt,
        status: status,
        error_message: errorMessage,
        event_snapshot_before: eventSnapshotBefore,
        upserted_events: upsertedEvents,
        deleted_events: deletedEvents,
        triggered_by: 'trigger_dot_dev',
      });
    };

    for (const token of tokens || []) {
      const syncStartedAt = dayjs().toISOString();
      let googleAccountEmail: string | null = null;

      const auth = getGoogleAuthClient(token);

      try {
        // get google account email from google api
        const googleAccount = await auth.getTokenInfo(
          token.access_token as string
        );
        googleAccountEmail = googleAccount.email || null;
        console.log('googleAccountEmail', googleAccountEmail);
      } catch (error) {
        console.error('Error fetching google account email:', error);
        await endSync(
          token.ws_id,
          null,
          syncStartedAt,
          dayjs().toISOString(),
          'failed',
          'Error fetching google account email: ' + error,
          [],
          [],
          []
        );
        continue;
      }

      // get events before sync
      const { data: eventsBeforeSync, error: errorEventsBeforeSync } =
        await supabase
          .from('workspace_calendar_events')
          .select('*')
          .eq('ws_id', token.ws_id)
          .not('google_event_id', 'is', null);
      if (errorEventsBeforeSync) {
        console.error(
          'Error fetching events before sync:',
          errorEventsBeforeSync
        );
        await endSync(
          token.ws_id,
          googleAccountEmail,
          syncStartedAt,
          dayjs().toISOString(),
          'failed',
          'Error fetching events before sync: ' + errorEventsBeforeSync.message,
          eventsBeforeSync || [],
          [],
          []
        );
        continue;
      }
      const { ws_id, access_token, refresh_token } = token;
      if (!access_token) {
        console.error('No Google access token found for wsIds:', {
          ws_id,
          hasAccessToken: !!access_token,
          hasRefreshToken: !!refresh_token,
        });
        await endSync(
          token.ws_id,
          googleAccountEmail,
          syncStartedAt,
          dayjs().toISOString(),
          'failed',
          'No Google access token found for wsIds',
          eventsBeforeSync || [],
          [],
          []
        );
        continue;
      }

      try {
        const calendar = google.calendar({ version: 'v3', auth });

        const now = dayjs();
        const timeMin = now.toDate();
        const timeMax = now.add(BACKGROUND_SYNC_RANGE, 'day');

        const response = await calendar.events.list({
          calendarId: 'primary',
          timeMin: timeMin.toISOString(), // from now
          timeMax: timeMax.toISOString(), // to the next 4 weeks
          singleEvents: true, // separate recurring events
          orderBy: 'startTime',
          maxResults: 1000,
        });

        const events = response.data.items || [];

        // format the events to match the expected structure
        const formattedEvents = events.map((event) => ({
          google_event_id: event.id,
          title: event.summary || 'Untitled Event',
          description: event.description || '',
          start_at: event.start?.dateTime || event.start?.date || '',
          end_at: event.end?.dateTime || event.end?.date || '',
          location: event.location || '',
          color: getColorFromGoogleColorId(event.colorId ?? undefined),
          ws_id: ws_id,
          locked: false,
        }));
        console.log('ws_id', ws_id);
        console.log('access_token', access_token);
        console.log('refresh_token', refresh_token);
        console.log('formattedEvents', formattedEvents);

        // upsert the events in the database for this wsId
        const { error } = await supabase
          .from('workspace_calendar_events')
          .upsert(formattedEvents, {
            onConflict: 'google_event_id',
          });
        if (error) {
          console.error('Error upserting events:', error);
          await endSync(
            ws_id,
            googleAccountEmail,
            syncStartedAt,
            dayjs().toISOString(),
            'failed',
            'Error upserting events: ' + error.message,
            eventsBeforeSync || [],
            formattedEvents as WorkspaceCalendarEvent[],
            []
          );
          continue;
        }
        console.log(
          'Upserted events for wsId:',
          ws_id,
          formattedEvents.map((e) => e.title)
        );

        // Google calendar not null
        const { data: dbEventsAfterUpsert, error: dbError } = await supabase
          .from('workspace_calendar_events')
          .select('*')
          .eq('ws_id', ws_id)
          .not('google_event_id', 'is', null)
          .gte('start_at', timeMin.toISOString())
          .lte('start_at', timeMax.toISOString());

        if (dbError) {
          console.error('Error fetching events after upsert:', dbError);
          await endSync(
            ws_id,
            googleAccountEmail,
            syncStartedAt,
            dayjs().toISOString(),
            'failed',
            'Error fetching events after upsert: ' + dbError.message,
            eventsBeforeSync || [],
            formattedEvents as WorkspaceCalendarEvent[],
            []
          );
          continue;
        }

        const eventsToDelete: WorkspaceCalendarEvent[] = [];
        for (const event of dbEventsAfterUpsert) {
          if (
            !formattedEvents.some(
              (e) => e.google_event_id === event.google_event_id
            )
          ) {
            eventsToDelete.push(event);
          }
        }

        const { error: deleteError } = await supabase
          .from('workspace_calendar_events')
          .delete()
          .in(
            'id',
            eventsToDelete.map((e) => e.id)
          );

        if (deleteError) {
          console.error('Error deleting events:', deleteError);
          await endSync(
            ws_id,
            googleAccountEmail,
            syncStartedAt,
            dayjs().toISOString(),
            'failed',
            'Error deleting events: ' + deleteError.message,
            eventsBeforeSync || [],
            formattedEvents as WorkspaceCalendarEvent[],
            eventsToDelete as WorkspaceCalendarEvent[]
          );
          continue;
        }

        console.log(
          'Deleted events for wsId:',
          ws_id,
          eventsToDelete.map((e) => e.title)
        );

        await endSync(
          ws_id,
          googleAccountEmail,
          syncStartedAt,
          dayjs().toISOString(),
          'success',
          '',
          eventsBeforeSync || [],
          formattedEvents as WorkspaceCalendarEvent[],
          eventsToDelete as WorkspaceCalendarEvent[]
        );

        // Update lastUpsert timestamp after successful upsert
        await updateLastUpsert(ws_id, supabase);
      } catch (error) {
        console.error('Error fetching Google Calendar events:', error);
        await endSync(
          ws_id,
          googleAccountEmail,
          syncStartedAt,
          dayjs().toISOString(),
          'failed',
          'Error fetching Google Calendar events: ' + error,
          eventsBeforeSync || [],
          [],
          []
        );
      }
    }
  } catch (error) {
    console.error('Error in fetchGoogleCalendarEvents:', error);
    return [];
  }
};
