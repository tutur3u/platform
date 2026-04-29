import { google, OAuth2Client } from '@tuturuuu/google';
import { createGraphClient } from '@tuturuuu/microsoft';
import { fetchMicrosoftCalendars } from '@tuturuuu/microsoft/calendar';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const querySchema = z.object({
  wsId: z.string().max(MAX_NAME_LENGTH),
});

const getGoogleAuthClient = (tokens: {
  access_token: string;
  refresh_token?: string | null;
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
  const supabase = await createClient(request);
  const { user, authError: userError } =
    await resolveAuthenticatedSessionUser(supabase);

  if (userError || !user) {
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Missing or invalid workspace ID' },
      { status: 400 }
    );
  }

  const normalizedWsId = await normalizeWorkspaceId(parsed.data.wsId);

  const { data: tokens, error: tokensError } = await supabase
    .from('calendar_auth_tokens')
    .select(
      'id, provider, access_token, refresh_token, account_email, account_name'
    )
    .eq('user_id', user.id)
    .eq('ws_id', normalizedWsId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (tokensError) {
    return NextResponse.json(
      { error: 'Failed to fetch connected accounts' },
      { status: 500 }
    );
  }

  const byAccount: Record<string, unknown[]> = {};
  const calendars: unknown[] = [];

  for (const token of tokens ?? []) {
    try {
      if (token.provider === 'google') {
        const auth = getGoogleAuthClient({
          access_token: token.access_token,
          refresh_token: token.refresh_token,
        });
        const calendar = google.calendar({ version: 'v3', auth });
        const response = await calendar.calendarList.list({
          minAccessRole: 'reader',
          showHidden: false,
          showDeleted: false,
        });

        const accountCalendars = (response.data.items || []).map((entry) => ({
          id: entry.id || '',
          name: entry.summary || 'Untitled Calendar',
          description: entry.description || '',
          primary: entry.primary || false,
          backgroundColor: entry.backgroundColor || '#4285F4',
          foregroundColor: entry.foregroundColor || '#FFFFFF',
          accessRole: entry.accessRole || 'reader',
          provider: 'google' as const,
          accountId: token.id,
          accountEmail: token.account_email,
        }));

        byAccount[token.id] = accountCalendars;
        calendars.push(...accountCalendars);
        continue;
      }

      if (token.provider === 'microsoft') {
        const client = createGraphClient(token.access_token);
        const response = await fetchMicrosoftCalendars(client);
        const accountCalendars = response.map((entry) => ({
          id: entry.id,
          name: entry.name,
          description: '',
          primary: entry.isDefaultCalendar,
          backgroundColor: entry.hexColor || '#0078D4',
          foregroundColor: '#FFFFFF',
          accessRole: entry.canEdit ? 'writer' : 'reader',
          provider: 'microsoft' as const,
          accountId: token.id,
          accountEmail: token.account_email,
        }));

        byAccount[token.id] = accountCalendars;
        calendars.push(...accountCalendars);
      }
    } catch (error) {
      console.error(
        `Failed to fetch provider calendars for ${token.provider}:${token.id}`,
        error
      );
      byAccount[token.id] = [];
    }
  }

  return NextResponse.json({
    calendars,
    byAccount,
    accounts:
      tokens?.map((token) => ({
        id: token.id,
        provider: token.provider,
        email: token.account_email,
        name: token.account_name,
      })) ?? [],
  });
}
