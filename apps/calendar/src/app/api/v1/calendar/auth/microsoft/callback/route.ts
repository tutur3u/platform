import {
  ConfidentialClientApplication,
  createGraphClient,
  createMsalConfig,
  MICROSOFT_CALENDAR_SCOPES,
} from '@tuturuuu/microsoft';
import { fetchMicrosoftCalendars } from '@tuturuuu/microsoft/calendar';
import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeCalendarOAuthCallback } from '@/lib/calendar/calendar-oauth-callback-guard';
import { verifyCalendarOAuthState } from '@/lib/calendar/calendar-oauth-state';
import { buildCalendarPostAuthRedirectUrl } from '@/lib/calendar/google-oauth-urls';
import {
  getMicrosoftOAuthConfig,
  isMicrosoftConfigComplete,
} from '@/lib/calendar/microsoft-config';
import { microsoftRefreshCredential } from '@/lib/calendar/microsoft-refresh-credential';
import {
  calendarOAuthDebug,
  calendarOAuthError,
} from '@/lib/calendar/oauth-callback-logger';

const microsoftCallbackQuerySchema = z.object({
  code: z.string().max(MAX_NAME_LENGTH).optional().nullable(),
  state: z.string().max(MAX_LONG_TEXT_LENGTH).optional().nullable(),
  error: z.string().max(MAX_LONG_TEXT_LENGTH).optional().nullable(),
  error_description: z.string().max(MAX_LONG_TEXT_LENGTH).optional().nullable(),
});

export async function GET(request: Request): Promise<NextResponse> {
  calendarOAuthDebug('🔍 [DEBUG] Microsoft OAuth callback route called');

  const url = new URL(request.url);
  const queryParams = Object.fromEntries(url.searchParams.entries());

  const result = microsoftCallbackQuerySchema.safeParse(queryParams);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid callback parameters' },
      { status: 400 }
    );
  }

  const { code, state, error, error_description } = result.data;
  const config = getMicrosoftOAuthConfig();
  const configComplete = isMicrosoftConfigComplete(config);
  // The state is signed at initiation and binds this flow to the initiating
  // user and workspace; never trust a workspace taken from the URL alone.
  const verifiedState = configComplete
    ? verifyCalendarOAuthState('microsoft', state, config.clientSecret)
    : null;
  // Browser redirects use the canonical Web origin, never the request host.
  const redirectWsId = verifiedState?.ok ? verifiedState.wsId : null;

  if (error) {
    calendarOAuthError(
      '❌ [DEBUG] Microsoft OAuth error:',
      error,
      error_description
    );
    const redirectUrl = buildCalendarPostAuthRedirectUrl(redirectWsId, {
      error: 'microsoft_auth_failed',
      message: error_description || error || 'Unknown error',
    });

    return NextResponse.redirect(redirectUrl, 302);
  }

  if (!state) {
    calendarOAuthDebug('❌ [DEBUG] Missing state in callback');
    return NextResponse.json({ error: 'state is required' }, { status: 400 });
  }

  if (!code) {
    calendarOAuthDebug('❌ [DEBUG] Missing code in callback');
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  if (!configComplete) {
    return NextResponse.json(
      { error: 'Microsoft OAuth not configured' },
      { status: 500 }
    );
  }

  if (!verifiedState?.ok) {
    calendarOAuthDebug('❌ [DEBUG] Rejected OAuth state', {
      reason: verifiedState?.reason,
    });
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 });
  }
  const { wsId } = verifiedState;

  // Retrieve the PKCE code verifier from the cookie
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get('ms_pkce_verifier')?.value;

  if (!codeVerifier) {
    calendarOAuthError('❌ [DEBUG] Missing PKCE code verifier');
    const redirectUrl = buildCalendarPostAuthRedirectUrl(redirectWsId, {
      error: 'microsoft_auth_failed',
      message: 'PKCE verification failed. Please try again.',
    });
    return NextResponse.redirect(redirectUrl, 302);
  }

  // Same signed-in user, current workspace member, and first use of the state.
  const authorization = await authorizeCalendarOAuthCallback({
    provider: 'microsoft',
    request,
    verifiedState,
  });
  if (!authorization.ok) return authorization.response;
  const { supabase, user } = authorization;

  try {
    calendarOAuthDebug('🔍 [DEBUG] Creating MSAL client...');
    const msalConfig = createMsalConfig(config);
    const cca = new ConfidentialClientApplication(msalConfig);

    calendarOAuthDebug(
      '🔍 [DEBUG] Exchanging authorization code for tokens...'
    );
    const tokenResponse = await cca.acquireTokenByCode({
      code,
      scopes: MICROSOFT_CALENDAR_SCOPES,
      redirectUri: config.redirectUri,
      codeVerifier, // Include the PKCE code verifier
    });

    if (!tokenResponse) {
      calendarOAuthDebug('❌ [DEBUG] No token response from Microsoft');
      return NextResponse.json(
        { error: 'No token received from Microsoft' },
        { status: 500 }
      );
    }

    calendarOAuthDebug('🔍 [DEBUG] Token exchange result:', {
      hasAccessToken: !!tokenResponse.accessToken,
      hasAccount: !!tokenResponse.account,
      expiresOn: tokenResponse.expiresOn,
    });

    // Get user info from Microsoft Graph
    calendarOAuthDebug('🔍 [DEBUG] Fetching user info from Microsoft Graph...');
    const graphClient = createGraphClient(tokenResponse.accessToken);
    const userInfo = await graphClient.api('/me').get();

    const accountEmail =
      userInfo.mail ||
      userInfo.userPrincipalName ||
      tokenResponse.account?.username;
    const accountName = userInfo.displayName || tokenResponse.account?.name;

    calendarOAuthDebug('🔍 [DEBUG] User info:', {
      email: accountEmail,
      name: accountName,
    });

    // Check if this Microsoft account is already connected
    calendarOAuthDebug('🔍 [DEBUG] Checking for existing Microsoft token...');
    const { data: existingToken, error: fetchError } = await supabase
      .from('calendar_auth_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('ws_id', wsId)
      .eq('provider', 'microsoft')
      .eq('account_email', accountEmail)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      calendarOAuthError(
        '❌ [DEBUG] Error fetching existing token:',
        fetchError
      );
      return NextResponse.json(
        { error: 'Failed to fetch existing token' },
        { status: 500 }
      );
    }

    // Persist the account-bound refresh credential before the request-local
    // MSAL cache disappears. An access token alone cannot power scheduled sync.
    const refreshToken = microsoftRefreshCredential(
      cca.getTokenCache().serialize(),
      tokenResponse.account?.homeAccountId,
      config.clientId
    );
    if (!refreshToken) {
      return NextResponse.json(
        {
          error: 'Microsoft offline access was not granted. Please reconnect.',
        },
        { status: 502 }
      );
    }
    const expiresAt = tokenResponse.expiresOn?.toISOString() || null;

    if (existingToken) {
      calendarOAuthDebug('🔍 [DEBUG] Updating existing Microsoft token...');
      const { error: updateError } = await supabase
        .from('calendar_auth_tokens')
        .update({
          access_token: tokenResponse.accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          account_name: accountName,
          is_active: true,
          created_at: new Date().toISOString(),
        })
        .eq('id', existingToken.id);

      if (updateError) {
        calendarOAuthError('❌ [DEBUG] Error updating token:', updateError);
        return NextResponse.json(
          { error: 'Failed to update token' },
          { status: 500 }
        );
      }
      calendarOAuthDebug('✅ [DEBUG] Microsoft token updated successfully');
    } else {
      calendarOAuthDebug('🔍 [DEBUG] Inserting new Microsoft token...');
      const { error: insertError } = await supabase
        .from('calendar_auth_tokens')
        .insert({
          user_id: user.id,
          ws_id: wsId,
          provider: 'microsoft',
          access_token: tokenResponse.accessToken,
          refresh_token: refreshToken,
          account_email: accountEmail,
          account_name: accountName,
          expires_at: expiresAt,
          is_active: true,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        calendarOAuthError('❌ [DEBUG] Error inserting token:', insertError);
        return NextResponse.json(
          { error: 'Failed to insert token' },
          { status: 500 }
        );
      }
      calendarOAuthDebug('✅ [DEBUG] Microsoft token inserted successfully');
    }

    // Auto-add all calendars to calendar_connections after successful authentication
    try {
      calendarOAuthDebug(
        '🔍 [DEBUG] Fetching Microsoft calendars to auto-add...'
      );

      // Get the newly inserted/updated token ID
      const { data: tokenRecord } = await supabase
        .from('calendar_auth_tokens')
        .select('id')
        .eq('user_id', user.id)
        .eq('ws_id', wsId)
        .eq('provider', 'microsoft')
        .eq('account_email', accountEmail)
        .eq('is_active', true)
        .single();

      if (tokenRecord?.id) {
        // Fetch all calendars for this Microsoft account
        const calendars = await fetchMicrosoftCalendars(graphClient);
        calendarOAuthDebug(
          `🔍 [DEBUG] Found ${calendars.length} Microsoft calendars to add`
        );

        if (calendars.length > 0) {
          // Prepare connections for batch upsert
          const connectionsToUpsert = calendars
            .filter((cal) => cal.id)
            .map((cal) => ({
              ws_id: wsId,
              calendar_id: cal.id!,
              calendar_name: cal.name || 'Untitled Calendar',
              is_enabled: true,
              color: cal.hexColor || '#0078D4',
              auth_token_id: tokenRecord.id,
              provider: 'microsoft',
            }));

          // Batch upsert into calendar_connections
          const { error: upsertError } = await supabase
            .from('calendar_connections')
            .upsert(connectionsToUpsert, {
              onConflict: 'ws_id, calendar_id',
            });

          if (upsertError) {
            calendarOAuthError(
              '⚠️ [DEBUG] Failed to batch upsert Microsoft calendar connections:',
              upsertError
            );
          } else {
            calendarOAuthDebug(
              `✅ [DEBUG] Successfully batched upserted ${connectionsToUpsert.length} Microsoft calendars`
            );
          }
        }
      }
    } catch (calendarAddError) {
      calendarOAuthError(
        '⚠️ [DEBUG] Error auto-adding Microsoft calendars:',
        calendarAddError
      );
      // Don't fail the authentication flow if calendar add fails
    }

    calendarOAuthDebug('🔍 [DEBUG] Redirecting to calendar page...');

    // Create redirect response and clear the PKCE cookie
    const redirectUrl = buildCalendarPostAuthRedirectUrl(wsId, {
      provider: 'microsoft',
      connected: 'true',
    });

    const redirectResponse = NextResponse.redirect(redirectUrl, 302);

    // Clear the PKCE verifier cookie
    redirectResponse.cookies.delete('ms_pkce_verifier');

    return redirectResponse;
  } catch (error) {
    calendarOAuthError('❌ [DEBUG] Error during Microsoft OAuth callback:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
