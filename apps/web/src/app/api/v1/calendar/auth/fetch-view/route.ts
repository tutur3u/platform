import { createClient } from '@tuturuuu/supabase/next/server';
import { endOfDay, startOfDay } from 'date-fns';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const getGoogleAuthClient = (tokens: {
  access_token: string;
  refresh_token?: string;
}) => {
  // Validate required Google OAuth env vars
  const requiredEnvVars = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  } as const;

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  const oauth2Client = new OAuth2Client({
    clientId: requiredEnvVars.GOOGLE_CLIENT_ID,
    clientSecret: requiredEnvVars.GOOGLE_CLIENT_SECRET,
    redirectUri: requiredEnvVars.GOOGLE_REDIRECT_URI,
  });

  oauth2Client.setCredentials(tokens);
  return oauth2Client;
};

export async function POST(request: Request) {
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

  try {
    // Get request body
    const body = await request.json();
    const { dates, wsId } = body;

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return NextResponse.json(
        {
          error: 'Failed to fetch Google Calendar events',
          statusCode: 400,
          details: 'No dates provided or invalid dates format',
        },
        { status: 400 }
      );
    }

    if (!wsId) {
      return NextResponse.json(
        {
          error: 'Failed to fetch Google Calendar events',
          statusCode: 400,
          details: 'Missing workspace ID',
        },
        { status: 400 }
      );
    }

    // Get the user's tokens
    const result = await supabase
      .from('calendar_auth_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .eq('ws_id', wsId)
      .maybeSingle();

    const googleTokens = result.data;
    const googleTokensError = result.error;

    if (googleTokensError) {
      console.error('Database query error:', {
        error: googleTokensError,
        message: googleTokensError.message,
        details: googleTokensError.details,
        hint: googleTokensError.hint,
        code: googleTokensError.code,
        userId: user.id,
        wsId,
      });

      if (googleTokensError.code === 'PGRST116') {
        return NextResponse.json(
          {
            error: 'Failed to fetch Google Calendar events',
            statusCode: 401,
            googleError: 'Google Calendar not authenticated',
            details: {
              hasAccessToken: false,
              hasRefreshToken: false,
              userId: user.id,
              reason: 'No tokens found in database',
            },
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        {
          error: 'Failed to fetch Google Calendar events',
          statusCode: 500,
          googleError: 'Database error',
          details: {
            tokenError: googleTokensError.message,
            hasAccessToken: false,
            hasRefreshToken: false,
            userId: user.id,
            errorCode: googleTokensError.code,
          },
        },
        { status: 500 }
      );
    }

    const tokens = googleTokens as {
      access_token: string;
      refresh_token: string;
    } | null;

    if (!tokens?.access_token) {
      console.error('No Google access token found for user:', {
        userId: user.id,
        hasAccessToken: !!tokens?.access_token,
        hasRefreshToken: !!tokens?.refresh_token,
      });
      return NextResponse.json(
        {
          error: 'Failed to fetch Google Calendar events',
          statusCode: 401,
          googleError: 'Google Calendar not authenticated',
          details: {
            hasAccessToken: false,
            hasRefreshToken: !!tokens?.refresh_token,
            userId: user.id,
            reason: 'Access token is empty',
          },
        },
        { status: 401 }
      );
    }

    try {
      const auth = getGoogleAuthClient(tokens);
      const calendar = google.calendar({ version: 'v3', auth });

      // Convert dates to Date objects and sort them
      const sortedDates = dates
        .map((dateStr: string) => {
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) {
            throw new Error(`Invalid date: ${dateStr}`);
          }
          return date;
        })
        .sort((a, b) => a.getTime() - b.getTime());

      if (sortedDates.length === 0) {
        return NextResponse.json(
          {
            error: 'Failed to fetch Google Calendar events',
            statusCode: 400,
            details: 'No valid dates provided',
          },
          { status: 400 }
        );
      }

      // Get the earliest and latest dates
      const timeMin = startOfDay(sortedDates[0] as Date);
      const timeMax = endOfDay(sortedDates[sortedDates.length - 1] as Date);

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true, // separate recurring events
        orderBy: 'startTime',
        maxResults: 1000,
      });

      const events = response.data.items || [];

      // Filter events to only include those that fall on the requested dates
      const formattedEvents = events
        .map((event) => ({
          google_event_id: event.id,
          title: event.summary || 'Untitled Event',
          description: event.description || '',
          start_at: event.start?.dateTime || event.start?.date || '',
          end_at: event.end?.dateTime || event.end?.date || '',
          location: event.location || '',
          color: getColorFromGoogleColorId(event.colorId ?? undefined),
          ws_id: wsId,
          locked: false,
        }))
        .filter((event) => {
          const eventStart = new Date(event.start_at);
          const eventEnd = new Date(event.end_at);

          // Check if the event overlaps with any of the requested dates
          return sortedDates.some((date) => {
            const dayStart = startOfDay(date);
            const dayEnd = endOfDay(date);
            return (
              (eventStart >= dayStart && eventStart <= dayEnd) || // Event starts during the day
              (eventEnd >= dayStart && eventEnd <= dayEnd) || // Event ends during the day
              (eventStart <= dayStart && eventEnd >= dayEnd) // Event spans the entire day
            );
          });
        });

      return NextResponse.json({ events: formattedEvents }, { status: 200 });
    } catch (error: any) {
      console.error('Error fetching Google Calendar events:', error);

      const errorDetails =
        process.env.NODE_ENV === 'development'
          ? {
              error: 'Failed to fetch Google Calendar events',
              statusCode: error.response?.status || 500,
              googleError:
                error.response?.data?.error?.message || error.message,
              details: {
                ...error.response?.data?.error,
                hasAccessToken: !!tokens?.access_token,
                hasRefreshToken: !!tokens?.refresh_token,
                tokenLength: tokens?.access_token?.length,
                userId: user.id,
              },
            }
          : { error: 'Failed to fetch Google Calendar events' };

      if (error.response?.data?.error?.message?.includes('invalid_grant')) {
        return NextResponse.json(
          {
            ...errorDetails,
            error: 'Google token invalid, please re-authenticate',
            details: {
              ...errorDetails.details,
              requiresReauth: true,
            },
          },
          { status: 401 }
        );
      }

      return NextResponse.json(errorDetails, {
        status: errorDetails.statusCode,
      });
    }
  } catch (error: any) {
    console.error('Error fetching Google Calendar events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Google Calendar events' },
      { status: 500 }
    );
  }
}

// Helper function to convert Google Calendar color IDs to hex colors
const getColorFromGoogleColorId = (colorId?: string): string => {
  const colorMap: { [key: string]: string } = {
    '1': '#7986cb', // Lavender
    '2': '#33b679', // Sage
    '3': '#8e24aa', // Grape
    '4': '#e67c73', // Flamingo
    '5': '#f6c026', // Banana
    '6': '#f5511d', // Tangerine
    '7': '#039be5', // Peacock
    '8': '#616161', // Graphite
    '9': '#3f51b5', // Blueberry
    '10': '#0b8043', // Basil
    '11': '#d60000', // Tomato
  };

  return colorId ? colorMap[colorId] || '#039be5' : '#039be5'; // Default to Peacock
};
