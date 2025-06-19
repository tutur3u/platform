import { createAdminClient } from '@tuturuuu/supabase/next/server';
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

    for (const token of tokens || []) {
      const { ws_id, access_token, refresh_token } = token;
      if (!access_token) {
        console.error('No Google access token found for wsIds:', {
          ws_id,
          hasAccessToken: !!access_token,
          hasRefreshToken: !!refresh_token,
        });
      }

      try {
        const auth = getGoogleAuthClient(token);
        const calendar = google.calendar({ version: 'v3', auth });

        const startOfCurrentWeek = dayjs().startOf('week');
        const timeMin = startOfCurrentWeek.toDate();
        const timeMax = startOfCurrentWeek
          .add(BACKGROUND_SYNC_RANGE, 'day')
          .toDate();

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
        } else {
          // Update lastUpsert timestamp after successful upsert
          await updateLastUpsert(ws_id, supabase);
        }
      } catch (error) {
        console.error('Error fetching Google Calendar events:', error);
      }
    }
  } catch (error) {
    console.error('Error in fetchGoogleCalendarEvents:', error);
    return [];
  }
};
