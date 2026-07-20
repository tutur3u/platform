import { OAuth2Client } from '@tuturuuu/google';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { getGoogleCalendarOAuthConfig } from '@/lib/calendar/google-oauth-config';
import { resolveGoogleCalendarOAuthRedirectUri } from '@/lib/calendar/google-oauth-urls';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

export async function GET(request: NextRequest) {
  const wsId = request.nextUrl.searchParams.get('wsId');

  if (!wsId) {
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  const authContext = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: 'calendar' },
  });

  if (!authContext.ok) return authContext.response;

  const { supabase, user } = authContext;
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
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

  const oauthConfig = getGoogleCalendarOAuthConfig();
  if (!oauthConfig.ok) {
    console.error('Google Calendar OAuth is not configured');
    return NextResponse.json(
      {
        code: 'google_calendar_not_configured',
        error: 'Google Calendar integration is not configured',
      },
      { status: 503 }
    );
  }

  const auth = new OAuth2Client({
    clientId: oauthConfig.config.clientId,
    clientSecret: oauthConfig.config.clientSecret,
    redirectUri: resolveGoogleCalendarOAuthRedirectUri(request),
  });

  const authUrl = auth.generateAuthUrl({
    state: normalizedWsId,
    scope: [
      'https://www.googleapis.com/auth/calendar', // Full calendar access
      'https://www.googleapis.com/auth/userinfo.email', // Get user email
      'https://www.googleapis.com/auth/userinfo.profile', // Get user profile/name
    ],
    access_type: 'offline',
    include_granted_scopes: true,
  });

  return NextResponse.json({ authUrl }, { status: 200 });
}
