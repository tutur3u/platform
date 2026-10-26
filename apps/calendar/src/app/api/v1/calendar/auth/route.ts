import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { checkCalendarOAuthRuntime } from '@/lib/calendar/calendar-oauth-runtime';
import { buildGoogleCalendarAuthUrl } from '@/lib/calendar/google-calendar-auth-url';
import { getGoogleCalendarOAuthConfig } from '@/lib/calendar/google-oauth-config';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

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
  // The reconnect prompt also asks for consent for accounts the breaker
  // held, which stay active and so are not visible here.
  const needsConsent =
    (quarantined?.length ?? 0) > 0 ||
    request.nextUrl.searchParams.get('reconnect') === '1';

  const authUrl = buildGoogleCalendarAuthUrl({
    request,
    userId: user.id,
    wsId: normalizedWsId,
    clientId: oauthConfig.config.clientId,
    clientSecret: oauthConfig.config.clientSecret,
    consent: needsConsent,
  });

  return NextResponse.json({ authUrl }, { status: 200 });
}
