import { schedules } from '@trigger.dev/sdk/v3';
import { createClient } from '@tuturuuu/supabase/next/client';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';

// Initialize Supabase client
const supabase = createClient();

export const googleCalendarBackgroundSync = schedules.task({
  id: 'google-calendar-background-sync',
  cron: {
    // every 10 minutes
    pattern: '*/10 * * * *',
  },
  run: async () => {
    const events = await fetchGoogleCalendarEvents();
    console.log('Fetched events from all linked Google accounts:', events);
  },
});

const fetchGoogleCalendarEvents = async () => {
  try {
    // Fetch all Google Calendar auth tokens from the database
    const { data: authTokens, error: tokensError } = await supabase
      .from('calendar_auth_tokens')
      .select('*');

    if (tokensError) {
      console.error('Error fetching auth tokens:', tokensError);
      return [];
    }

    if (!authTokens || authTokens.length === 0) {
      console.log('No Google Calendar auth tokens found in database');
      return [];
    }

    const allEvents: any[] = [];

    // Fetch events from each linked Google account
    for (const token of authTokens) {
      try {
        const events = await fetchEventsFromGoogleAccount(token);
        allEvents.push(...events);
      } catch (error) {
        console.error(
          `Error fetching events for user ${token.user_id}:`,
          error
        );
        // Continue with other accounts even if one fails
      }
    }

    return allEvents;
  } catch (error) {
    console.error('Error in fetchGoogleCalendarEvents:', error);
    return [];
  }
};

const fetchEventsFromGoogleAccount = async (authToken: {
  user_id: string;
  ws_id: string;
  access_token: string;
  refresh_token: string;
}) => {
  try {
    // Create Google OAuth2 client
    const oauth2Client = new OAuth2Client({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI,
    });

    oauth2Client.setCredentials({
      access_token: authToken.access_token,
      refresh_token: authToken.refresh_token,
    });

    // Create Google Calendar client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Set time range for fetching events (e.g., next 30 days)
    const timeMin = new Date();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 30);

    // Fetch events from Google Calendar
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });

    const events = response.data.items || [];

    // Format events and add metadata about the source account
    return events.map((event) => ({
      google_event_id: event.id,
      title: event.summary || 'Untitled Event',
      description: event.description || '',
      start_at: event.start?.dateTime || event.start?.date || '',
      end_at: event.end?.dateTime || event.end?.date || '',
      location: event.location || '',
      color: getColorFromGoogleColorId(event.colorId ?? undefined),
      ws_id: authToken.ws_id,
      user_id: authToken.user_id,
      locked: false,
      source: 'google_calendar',
    }));
  } catch (error: any) {
    console.error(
      `Error fetching events for user ${authToken.user_id}:`,
      error
    );

    // If token is invalid, you might want to handle token refresh here
    if (error.response?.data?.error === 'invalid_grant') {
      console.log(
        `Token expired for user ${authToken.user_id}, needs re-authentication`
      );
    }

    throw error;
  }
};

const getColorFromGoogleColorId = (colorId?: string): string => {
  // Google Calendar color mapping
  const colorMap: { [key: string]: string } = {
    '1': '#7986cb', // Lavender
    '2': '#33b679', // Sage
    '3': '#8f24aa', // Grape
    '4': '#e67c73', // Flamingo
    '5': '#f6c026', // Banana
    '6': '#f4511e', // Tangerine
    '7': '#039be5', // Peacock
    '8': '#616161', // Graphite
    '9': '#3f51b5', // Blueberry
    '10': '#0b8043', // Basil
    '11': '#d60000', // Tomato
  };

  return colorMap[colorId || ''] || '#039be5'; // Default to peacock blue
};
