import { OAuth2Client, google } from '@tuturuuu/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { convertGoogleAllDayEvent } from '@tuturuuu/ui/hooks/calendar-utils';
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

  // Get the user's tokens with more defensive query
  let googleTokens;
  let googleTokensError;

  let timeMin: Date | null = null;
  let timeMax: Date | null = null;

  try {
    // Get wsId from query parameters
    const url = new URL(request.url);
    const wsId = url.searchParams.get('wsId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (startDate) {
      timeMin = new Date(startDate);
    } else {
      timeMin = new Date();
      timeMin.setFullYear(timeMin.getFullYear() - 1);
    }

    if (endDate) {
      timeMax = new Date(endDate);
    } else {
      timeMax = new Date();
      timeMax.setFullYear(timeMax.getFullYear() + 1);
    }

    if (!wsId) {
      return NextResponse.json(
        {
          error: 'Failed to fetch Google Calendar events',
          statusCode: 400,
          googleError: 'Missing workspace ID',
          details: {
            hasAccessToken: false,
            hasRefreshToken: false,
            userId: user.id,
            reason: 'No workspace ID provided',
          },
        },
        { status: 400 }
      );
    }

    const result = await supabase
      .from('calendar_auth_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .eq('ws_id', wsId) // Add ws_id to the query
      .maybeSingle();

    googleTokens = result.data;
    googleTokensError = result.error;

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

      // If it's a not found error, handle it gracefully
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

      // For other database errors, return 500
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

    // Type assertion for the tokens
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

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true, // separate recurring events
        orderBy: 'startTime',
        maxResults: 1000,
      });

      const events = response.data.items || [];

      // format the events to match the expected structure
      const formattedEvents = events.map((event) => {
        // Use the new timezone-aware conversion for all-day events
        const { start_at, end_at } = convertGoogleAllDayEvent(
          event.start?.dateTime || event.start?.date || '',
          event.end?.dateTime || event.end?.date || '',
          // Use the user's browser timezone which is available in the process.env.TZ or system default
          // This will be enhanced later to use actual user preferences
          'auto'
        );

        return {
          google_event_id: event.id,
          title: event.summary || 'Untitled Event',
          description: event.description || '',
          start_at,
          end_at,
          location: event.location || '',
          color: getColorFromGoogleColorId(event.colorId ?? undefined),
          ws_id: '',
          locked: false,
        };
      });

      return NextResponse.json({ events: formattedEvents }, { status: 200 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error fetching Google Calendar events:', error);

      // Extract detailed error information
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

      // Special handling for invalid_grant error
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('Error fetching Google Calendar events:', error);

    // Extract detailed error information
    const errorDetails = {
      error: 'Failed to fetch Google Calendar events',
      statusCode: error.response?.status || 500,
      googleError: error.response?.data?.error?.message || error.message,
      details: {
        ...error.response?.data?.error,
        hasAccessToken: false,
        hasRefreshToken: false,
        userId: user.id,
      },
    };

    // Special handling for invalid_grant error
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

    return NextResponse.json(errorDetails, { status: errorDetails.statusCode });
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
