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

const getGoogleColorId = (color?: string): string => {
  const colorMap: Record<string, string> = {
    BLUE: '11',
    RED: '1',
    GREEN: '2',
    YELLOW: '5',
    ORANGE: '6',
    PURPLE: '9',
    PINK: '4',
    INDIGO: '10',
    CYAN: '8',
    GRAY: '3',
  };
  return color && colorMap[color] ? colorMap[color] : '11';
};

export async function POST(request: Request) {
  const body = await request.json();
  const { event } = body;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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

  if (googleTokensError) {
    return NextResponse.json(
      { error: 'Failed to fetch Google tokens' },
      { status: 500 }
    );
  }

  if (!googleTokens?.access_token) {
    return NextResponse.json(
      { error: 'Google Calendar not authenticated' },
      { status: 401 }
    );
  }

  try {
    const auth = getGoogleAuthClient(googleTokens);
    const calendar = google.calendar({ version: 'v3', auth });

    const googleEvent = {
      summary: event.title,
      description: event.description,
      start: {
        dateTime: event.start_at,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: event.end_at,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      colorId: getGoogleColorId(event.color),
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: googleEvent,
    });

    return NextResponse.json(
      { googleEventId: response.data.id },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to sync with Google Calendar:', error);
    return NextResponse.json(
      { error: 'Failed to sync event' },
      { status: 500 }
    );
  }
}
