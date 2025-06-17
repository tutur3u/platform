import { createClient } from '@supabase/supabase-js';
import { schedules } from '@trigger.dev/sdk/v3';
import 'dotenv/config';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

export const googleCalendarBackgroundSync = schedules.task({
  id: 'google-calendar-background-sync',
  cron: {
    // every 2 minutes
    pattern: '*/2 * * * *',
  },
  run: async () => {
    console.log(
      'process.env.NEXT_PUBLIC_SUPABASE_URL',
      process.env.NEXT_PUBLIC_SUPABASE_URL
    );
    // Initialize Supabase client inside the task function
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    await syncGoogleCalendarEvents(supabase);
    console.log('Synced events from all linked Google accounts');
  },
});

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

const syncGoogleCalendarEvents = async (supabase: any) => {
  try {
    // Fetch all wsId with auth tokens not null
    const result = await supabase
      .from('calendar_auth_tokens')
      .select('ws_id, access_token, refresh_token');

    const data = result.data;
    const error = result.error;

    if (error) {
      console.error('Error fetching auth tokens:', error);
      return [];
    }

    const googleTokens = data.map((item: any) => ({
      ws_id: item.ws_id,
      access_token: item.access_token,
      refresh_token: item.refresh_token,
    }));
    // Type assertion for the tokens
    const tokens = googleTokens as
      | {
          ws_id: string;
          access_token: string;
          refresh_token: string;
        }[]
      | null;

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

        const timeMin = new Date();
        const timeMax = new Date();
        timeMax.setDate(timeMax.getDate() + 28);

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
