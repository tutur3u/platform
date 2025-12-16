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

interface CalendarToken {
  id: string;
  access_token: string;
  refresh_token: string | null;
  account_email: string | null;
  account_name: string | null;
}

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
    const url = new URL(request.url);
    const wsId = url.searchParams.get('wsId');
    const accountId = url.searchParams.get('accountId'); // Optional: specific account

    if (!wsId) {
      return NextResponse.json(
        { error: 'Missing workspace ID' },
        { status: 400 }
      );
    }

    // Build query based on whether accountId is provided
    let query = supabase
      .from('calendar_auth_tokens')
      .select('id, access_token, refresh_token, account_email, account_name')
      .eq('user_id', user.id)
      .eq('ws_id', wsId)
      .eq('provider', 'google')
      .eq('is_active', true);

    if (accountId) {
      query = query.eq('id', accountId);
    }

    const { data: tokens, error: tokensError } = await query;

    if (tokensError || !tokens || tokens.length === 0) {
      return NextResponse.json(
        { error: 'No Google Calendar accounts found for this workspace' },
        { status: 401 }
      );
    }

    // Fetch calendars for all accounts
    const allCalendars: Array<{
      id: string;
      name: string;
      description: string;
      primary: boolean;
      backgroundColor: string;
      foregroundColor: string;
      accessRole: string;
      accountId: string;
      accountEmail: string | null;
    }> = [];

    for (const token of tokens as CalendarToken[]) {
      try {
        const auth = getGoogleAuthClient({
          access_token: token.access_token,
          refresh_token: token.refresh_token || undefined,
        });
        const calendar = google.calendar({ version: 'v3', auth });

        const response = await calendar.calendarList.list({
          minAccessRole: 'reader',
          showHidden: false,
          showDeleted: false,
        });

        const calendars = response.data.items || [];

        for (const cal of calendars) {
          allCalendars.push({
            id: cal.id || '',
            name: cal.summary || 'Untitled Calendar',
            description: cal.description || '',
            primary: cal.primary || false,
            backgroundColor: cal.backgroundColor || '#4285F4',
            foregroundColor: cal.foregroundColor || '#FFFFFF',
            accessRole: cal.accessRole || 'reader',
            accountId: token.id,
            accountEmail: token.account_email,
          });
        }
      } catch (error) {
        console.error(
          `Error fetching calendars for account ${token.id}:`,
          error
        );
        // Continue with other accounts
      }
    }

    // Group calendars by account
    const calendarsByAccount = tokens.reduce(
      (acc: Record<string, typeof allCalendars>, token: CalendarToken) => {
        acc[token.id] = allCalendars.filter((c) => c.accountId === token.id);
        return acc;
      },
      {}
    );

    return NextResponse.json(
      {
        calendars: allCalendars,
        byAccount: calendarsByAccount,
        accounts: tokens.map((t: CalendarToken) => ({
          id: t.id,
          email: t.account_email,
          name: t.account_name,
        })),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('Error fetching Google Calendar list:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to fetch calendar list',
        details:
          process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
