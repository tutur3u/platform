import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { WorkspaceCalendarEvent } from '@tuturuuu/types/db';
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
  console.log('=== Starting syncGoogleCalendarEvents function ===');

  try {
    console.log('Creating admin client...');
    const supabase = await createAdminClient({ noCookie: true });
    console.log('Admin client created successfully');

    // Fetch all wsId with auth tokens not null
    console.log('Fetching auth tokens from database...');
    const { data: tokens, error } = await supabase
      .from('calendar_auth_tokens')
      .select('ws_id, access_token, refresh_token');

    if (error) {
      console.error('Error fetching auth tokens:', error);
      return [];
    }

    console.log('Auth tokens fetched successfully');
    console.log('Number of tokens found:', tokens?.length || 0);

    console.log(
      'Synchronizing Google Calendar events for',
      tokens.length,
      'wsIds',
      tokens.map((token) => token.ws_id)
    );

    console.log('Starting to process tokens...');
    for (const token of tokens || []) {
      const { ws_id, access_token, refresh_token } = token;

      console.log('ws_id', ws_id);

      if (!access_token) {
        console.error('No Google access token found for wsIds:', {
          ws_id,
          hasAccessToken: !!access_token,
          hasRefreshToken: !!refresh_token,
        });
        continue;
      }

      console.log(`[${ws_id}] Starting sync process...`);

      const auth = getGoogleAuthClient(token);

      try {
        const calendar = google.calendar({ version: 'v3', auth });

        const now = dayjs();
        const timeMin = now.toDate();
        const timeMax = now.add(BACKGROUND_SYNC_RANGE, 'day');

        console.log(`[${ws_id}] Fetching events from Google Calendar...`);

        const response = await calendar.events.list({
          calendarId: 'primary',
          timeMin: timeMin.toISOString(), // from now
          timeMax: timeMax.toISOString(), // to the next 4 weeks
          singleEvents: true, // separate recurring events
          orderBy: 'startTime',
          maxResults: 1000,
        });

        const events = response.data.items || [];
        console.log(
          `[${ws_id}] Fetched ${events.length} events from Google Calendar`
        );

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
        console.log(`[${ws_id}] Formatted ${formattedEvents.length} events`);
        console.log(`[${ws_id}] access_token`, access_token);
        console.log(`[${ws_id}] refresh_token`, refresh_token);
        console.log(`[${ws_id}] formattedEvents`, formattedEvents);

        // upsert the events in the database for this wsId
        console.log(
          `[${ws_id}] Upserting ${formattedEvents.length} events to database...`
        );
        const { error } = await supabase
          .from('workspace_calendar_events')
          .upsert(formattedEvents, {
            onConflict: 'google_event_id',
          });
        if (error) {
          console.error(`[${ws_id}] Error upserting events:`, error);
          continue;
        }
        console.log(
          `[${ws_id}] Successfully upserted ${formattedEvents.length} events:`,
          formattedEvents.map((e) => e.title)
        );

        // Google calendar not null
        console.log(
          `[${ws_id}] Fetching existing events from database for cleanup...`
        );
        const { data: dbEventsAfterUpsert, error: dbError } = await supabase
          .from('workspace_calendar_events')
          .select('*')
          .eq('ws_id', ws_id)
          .not('google_event_id', 'is', null)
          .gte('start_at', timeMin.toISOString())
          .lte('start_at', timeMax.toISOString());

        if (dbError) {
          console.error(
            `[${ws_id}] Error fetching events after upsert:`,
            dbError
          );
          continue;
        }

        console.log(
          `[${ws_id}] Found ${dbEventsAfterUpsert?.length || 0} existing events in database`
        );

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

        console.log(
          `[${ws_id}] Found ${eventsToDelete.length} events to delete`
        );

        if (eventsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from('workspace_calendar_events')
            .delete()
            .in(
              'id',
              eventsToDelete.map((e) => e.id)
            );

          if (deleteError) {
            console.error(`[${ws_id}] Error deleting events:`, deleteError);
            continue;
          }

          console.log(
            `[${ws_id}] Successfully deleted ${eventsToDelete.length} events:`,
            eventsToDelete.map((e) => e.title)
          );
        }

        // Update lastUpsert timestamp after successful upsert
        console.log(`[${ws_id}] Updating lastUpsert timestamp...`);
        await updateLastUpsert(ws_id, supabase);
        console.log(`[${ws_id}] Sync completed successfully`);
      } catch (error) {
        console.error(
          `[${ws_id}] Error fetching Google Calendar events:`,
          error
        );
      }
    }
  } catch (error) {
    console.error('Error in fetchGoogleCalendarEvents:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      name: error instanceof Error ? error.name : 'Unknown error type',
    });
    return [];
  } finally {
    console.log('=== syncGoogleCalendarEvents function completed ===');
  }
};
