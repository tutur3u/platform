import { google, OAuth2Client } from '@tuturuuu/google';
import type { CalendarProviderAccountStatusPayload } from '@tuturuuu/internal-api/calendar';
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
import { getGoogleCalendarOAuthConfig } from '@/lib/calendar/google-oauth-config';
import { classifyCalendarProviderAccountStatus } from '@/lib/calendar/provider-account-status';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const querySchema = z.object({
  accountId: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  wsId: z.string().max(MAX_NAME_LENGTH),
});

const getGoogleAuthClient = (tokens: {
  access_token: string;
  refresh_token?: string | null;
}) => {
  const config = getGoogleCalendarOAuthConfig();
  if (!config.ok) return null;
  const oauth2Client = new OAuth2Client(config.config);

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
    allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] },
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
      'id, provider, access_token, refresh_token, expires_at, account_email, account_name'
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
  const accountStatuses: Record<string, CalendarProviderAccountStatusPayload> =
    {};

  for (const token of tokens ?? []) {
    if (token.provider !== 'google' && token.provider !== 'microsoft') continue;
    try {
      if (token.provider === 'google') {
        if (
          !token.refresh_token &&
          (!token.access_token ||
            Date.parse(token.expires_at ?? '') <= Date.now())
        ) {
          byAccount[token.id] = [];
          accountStatuses[token.id] = { state: 'reconnect_required' };
          continue;
        }
        const auth = getGoogleAuthClient({
          access_token: token.access_token,
          refresh_token: token.refresh_token,
        });
        if (!auth) {
          byAccount[token.id] = [];
          accountStatuses[token.id] = {
            state: 'temporarily_unavailable',
            issue: 'configuration',
          };
          console.warn('Calendar provider OAuth configuration unavailable', {
            provider: token.provider,
          });
          continue;
        }
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
        accountStatuses[token.id] = { state: 'connected' };
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
        accountStatuses[token.id] = { state: 'connected' };
        calendars.push(...accountCalendars);
      }
    } catch (error) {
      const state = classifyCalendarProviderAccountStatus(
        token.provider,
        error
      );
      console.warn('Failed to fetch provider calendars', {
        provider: token.provider,
        state,
      });
      byAccount[token.id] = [];
      accountStatuses[token.id] =
        state === 'configuration' || state === 'status_unknown'
          ? { state: 'temporarily_unavailable', issue: state }
          : { state };
    }
  }

  return NextResponse.json({
    calendars,
    byAccount,
    accountStatuses,
    accounts:
      tokens?.map((token) => ({
        id: token.id,
        provider: token.provider,
        email: token.account_email,
        name: token.account_name,
      })) ?? [],
  });
}
