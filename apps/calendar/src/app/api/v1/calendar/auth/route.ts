import { OAuth2Client } from '@tuturuuu/google';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { checkCalendarOAuthRuntime } from '@/lib/calendar/calendar-oauth-runtime';
import {
  createCalendarOAuthState,
  deriveCalendarOAuthPkce,
} from '@/lib/calendar/calendar-oauth-state';
import { getGoogleCalendarOAuthConfig } from '@/lib/calendar/google-oauth-config';
import { resolveGoogleCalendarOAuthRedirectUri } from '@/lib/calendar/google-oauth-urls';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

type GenerateAuthUrlOptions = NonNullable<
  Parameters<InstanceType<typeof OAuth2Client>['generateAuthUrl']>[0]
>;
const S256 = 'S256' as GenerateAuthUrlOptions['code_challenge_method'];

export async function GET(request: NextRequest) {
  const wsId = request.nextUrl.searchParams.get('wsId');

  if (!wsId) {
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  const authContext = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: ['calendar', 'tasks'] },
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

  const runtime = checkCalendarOAuthRuntime();
  if (!runtime.ok) return runtime.response;

  // Google omits the refresh token for an existing grant unless consent is
  // shown, so reconnecting a quarantined account would keep the rejected one.
  // Normal reconnects stay consent-free.
  const { data: quarantined } = await supabase
    .from('calendar_auth_tokens')
    .select('id')
    .eq('user_id', user.id)
    .eq('ws_id', normalizedWsId)
    .eq('provider', 'google')
    .eq('is_active', false)
    .not('deactivated_reason', 'is', null)
    .limit(1);
  const needsConsent = (quarantined?.length ?? 0) > 0;

  const auth = new OAuth2Client({
    clientId: oauthConfig.config.clientId,
    clientSecret: oauthConfig.config.clientSecret,
    redirectUri: resolveGoogleCalendarOAuthRedirectUri(request),
  });

  const { nonce, state } = createCalendarOAuthState(
    'google',
    { userId: user.id, wsId: normalizedWsId },
    oauthConfig.config.clientSecret
  );
  const { codeChallenge } = deriveCalendarOAuthPkce(
    'google',
    nonce,
    oauthConfig.config.clientSecret
  );

  const authUrl = auth.generateAuthUrl({
    state,
    code_challenge: codeChallenge,
    code_challenge_method: S256,
    scope: [
      'https://www.googleapis.com/auth/calendar', // Full calendar access
      'https://www.googleapis.com/auth/userinfo.email', // Get user email
      'https://www.googleapis.com/auth/userinfo.profile', // Get user profile/name
    ],
    access_type: 'offline',
    ...(needsConsent ? { prompt: 'consent' } : {}),
    include_granted_scopes: true,
  });

  return NextResponse.json({ authUrl }, { status: 200 });
}
