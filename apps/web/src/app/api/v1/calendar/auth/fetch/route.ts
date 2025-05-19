import { createClient } from '@tuturuuu/supabase/next/server';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { NextResponse } from 'next/server';

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('force') === 'true';
  const maxBatches = parseInt(url.searchParams.get('maxBatches') || '10');

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }

  const { data: googleTokens, error: googleTokensError } = await supabase
    .from('calendar_auth_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (googleTokensError || !googleTokens?.access_token) {
    return NextResponse.json(
      { error: 'Google Calendar not authenticated' },
      { status: 401 }
    );
  }

  try {
    const auth = getGoogleAuthClient(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth });

    // define the time range for the events
    const timeMin = new Date();
    timeMin.setFullYear(timeMin.getFullYear() - 1);
    const timeMax = new Date();
    timeMax.setFullYear(timeMax.getFullYear() + 1);

    // Fetch events with pagination - maximum of 2500 events across batches (to avoid overloading)
    const allEvents = [];
    let nextPageToken = null;
    let batchCounter = 0;

    do {
      // Build the request parameters
      const requestParams: any = {
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true, // separate recurring events
        orderBy: 'startTime',
        maxResults: 1000, // Maximum allowed by Google Calendar API
      };

      // Add page token if we have one from previous response
      if (nextPageToken) {
        requestParams.pageToken = nextPageToken;
      }

      // Execute the API request
      const response = await calendar.events.list(requestParams);

      // Process the events from this batch
      const events = response.data.items || [];
      allEvents.push(...events);

      // Get the next page token for pagination
      nextPageToken = response.data.nextPageToken || null;

      // Increment the batch counter
      batchCounter++;

      // Stop if we've reached the maximum number of batches or no more pages
      if (batchCounter >= maxBatches || !nextPageToken) {
        break;
      }
    } while (nextPageToken);

    // format the events to match the expected structure
    const formattedEvents = allEvents.map((event) => ({
      google_event_id: event.id,
      title: event.summary || 'Untitled Event',
      description: event.description || '',
      start_at: event.start?.dateTime || event.start?.date || '',
      end_at: event.end?.dateTime || event.end?.date || '',
      location: event.location || '',
      color: getColorFromGoogleColorId(event.colorId ?? undefined),
      ws_id: '',
      locked: false,
    }));

    return NextResponse.json(
      {
        events: formattedEvents,
        total: formattedEvents.length,
        hasMoreEvents: !!nextPageToken, // Indicate if there are more events available
        batchesFetched: batchCounter,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Failed to fetch Google Calendar events:', error);
    if (error.response?.data?.error === 'invalid_grant') {
      return NextResponse.json(
        {
          error: 'Google token invalid, please re-authenticate.',
          needsReAuth: true,
        },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch events from Google Calendar' },
      { status: 500 }
    );
  }
}

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
