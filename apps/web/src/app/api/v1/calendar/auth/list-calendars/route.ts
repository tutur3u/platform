import { google, OAuth2Client } from '@tuturuuu/google';
import { createClient } from '@tuturuuu/supabase/next/server';
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

  try {
    // Get wsId from query parameters
    const url = new URL(request.url);
    const wsId = url.searchParams.get('wsId');

    if (!wsId) {
      return NextResponse.json(
        { error: 'Missing workspace ID' },
        { status: 400 }
      );
    }

    // Get the user's OAuth tokens for this workspace
    const { data: tokens, error: tokensError } = await supabase
      .from('calendar_auth_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (tokensError || !tokens?.access_token) {
      return NextResponse.json(
        { error: 'Google Calendar not authenticated for this workspace' },
        { status: 401 }
      );
    }

    // Create Google Calendar API client
    const auth = getGoogleAuthClient(tokens);
    const calendar = google.calendar({ version: 'v3', auth });

    // Fetch the list of calendars
    const response = await calendar.calendarList.list({
      minAccessRole: 'reader', // Only show calendars user can read
      showHidden: false, // Don't show hidden calendars
      showDeleted: false, // Don't show deleted calendars
    });

    const calendars = response.data.items || [];

    // Format the response
    const formattedCalendars = calendars.map((cal) => ({
      id: cal.id || '',
      name: cal.summary || 'Untitled Calendar',
      description: cal.description || '',
      primary: cal.primary || false,
      backgroundColor: cal.backgroundColor || '#4285F4',
      foregroundColor: cal.foregroundColor || '#FFFFFF',
      accessRole: cal.accessRole || 'reader',
    }));

    return NextResponse.json(
      { calendars: formattedCalendars },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error fetching Google Calendar list:', error);

    // Handle invalid_grant error (token expired or revoked)
    if (error.response?.data?.error?.message?.includes('invalid_grant')) {
      return NextResponse.json(
        {
          error: 'Google token invalid, please re-authenticate',
          requiresReauth: true,
        },
        { status: 401 }
      );
    }

    // Handle insufficient scope error (403)
    if (error.code === 403 || error.status === 403) {
      return NextResponse.json(
        {
          error:
            'Insufficient permissions. Please disconnect and reconnect your Google Calendar to grant required permissions.',
          requiresReauth: true,
          details: 'The calendar.readonly scope is required to list calendars',
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch calendar list',
        details:
          process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
