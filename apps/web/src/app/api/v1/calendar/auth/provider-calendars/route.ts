import { google, OAuth2Client } from '@tuturuuu/google';
import { createGraphClient } from '@tuturuuu/microsoft';
import { fetchMicrosoftCalendars } from '@tuturuuu/microsoft/calendar';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const querySchema = z.object({
  accountId: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
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

  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: 'calendar' },
  });

  if (!auth.ok) return auth.response;

  const { supabase, user } = auth;
  const normalizedWsId = await normalizeWorkspaceId(parsed.data.wsId, supabase);
  const membership = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId: user.id,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let tokenQuery = supabase
    .from('calendar_auth_tokens')
    .select(
      'id, provider, access_token, refresh_token, account_email, account_name'
    )
    .eq('user_id', user.id)
    .eq('ws_id', normalizedWsId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (parsed.data.accountId) {
    tokenQuery = tokenQuery.eq('id', parsed.data.accountId);
  }

  const { data: tokens, error: tokensError } = await tokenQuery;

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
      serverLogger.warn('Failed to fetch provider calendars', {
        provider: token.provider,
        tokenId: token.id,
        error,
      });
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
