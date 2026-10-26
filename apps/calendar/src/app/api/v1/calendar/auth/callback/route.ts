import { google, OAuth2Client } from '@tuturuuu/google';
import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { authorizeCalendarOAuthCallback } from '@/lib/calendar/calendar-oauth-callback-guard';
import {
  buildCalendarPostAuthRedirectUrl,
  checkCalendarOAuthRuntime,
} from '@/lib/calendar/calendar-oauth-runtime';
import {
  deriveCalendarOAuthPkce,
  verifyCalendarOAuthState,
} from '@/lib/calendar/calendar-oauth-state';
import { reactivateCalendarAuthToken } from '@/lib/calendar/calendar-token-reconnect';
import { buildGoogleCalendarAuthUrl } from '@/lib/calendar/google-calendar-auth-url';
import { admitGoogleConsentRestart } from '@/lib/calendar/google-consent-restart';
import { getGoogleCalendarOAuthConfig } from '@/lib/calendar/google-oauth-config';
import { resolveGoogleCalendarOAuthRedirectUri } from '@/lib/calendar/google-oauth-urls';
import {
  calendarOAuthDebug,
  calendarOAuthError,
} from '@/lib/calendar/oauth-callback-logger';
import { resolveCalendarLocale } from '@/runtime/request-locale';

async function loadPerformFullSyncForWorkspace() {
  const { performFullSyncForWorkspace } = await import(
    '@tuturuuu/trigger/google-calendar-full-sync'
  );

  return performFullSyncForWorkspace;
}

export async function GET(request: Request) {
  calendarOAuthDebug('🔍 [DEBUG] OAuth callback route called');

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  calendarOAuthDebug('🔍 [DEBUG] OAuth callback parameters:', {
    hasCode: !!code,
    hasState: !!state,
  });

  if (!state) {
    calendarOAuthDebug('❌ [DEBUG] Missing state in callback');
    return NextResponse.json({ error: 'state is required' }, { status: 400 });
  }

  if (!code) {
    calendarOAuthDebug('❌ [DEBUG] Missing code in callback');
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  const oauthConfig = getGoogleCalendarOAuthConfig();
  if (!oauthConfig.ok) {
    calendarOAuthError('Google Calendar OAuth is not configured');
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

  // The state is signed at initiation and binds this flow to the initiating
  // user and workspace; never trust a workspace taken from the URL alone.
  const verifiedState = verifyCalendarOAuthState(
    'google',
    state,
    oauthConfig.config.clientSecret
  );
  if (!verifiedState.ok) {
    calendarOAuthDebug('❌ [DEBUG] Rejected OAuth state', {
      reason: verifiedState.reason,
    });
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 });
  }

  // Same signed-in user, current workspace member, and first use of the state.
  const authorization = await authorizeCalendarOAuthCallback({
    provider: 'google',
    request,
    verifiedState,
  });
  if (!authorization.ok) return authorization.response;
  const { supabase, user, wsId } = authorization;
  const { codeVerifier } = deriveCalendarOAuthPkce(
    'google',
    verifiedState.nonce,
    oauthConfig.config.clientSecret
  );

  calendarOAuthDebug('🔍 [DEBUG] Creating OAuth2Client...');
  const auth = new OAuth2Client({
    clientId: oauthConfig.config.clientId,
    clientSecret: oauthConfig.config.clientSecret,
    redirectUri: resolveGoogleCalendarOAuthRedirectUri(request),
  });

  try {
    calendarOAuthDebug(
      '🔍 [DEBUG] Exchanging authorization code for tokens...'
    );
    // Exchange the authorization code for tokens
    const { tokens } = await auth.getToken({ code, codeVerifier });

    calendarOAuthDebug('🔍 [DEBUG] Token exchange result:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      tokenType: tokens.token_type,
      expiryDate: tokens.expiry_date,
    });

    if (!tokens.access_token) {
      calendarOAuthDebug('❌ [DEBUG] No access token received from Google');
      return NextResponse.json(
        { error: 'No access token received' },
        { status: 500 }
      );
    }

    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null;

    // Fetch user info from Google to get account email
    calendarOAuthDebug('🔍 [DEBUG] Fetching Google user info...');
    auth.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth });
    let accountEmail: string | null = null;
    let accountName: string | null = null;

    try {
      const userInfoResponse = await oauth2.userinfo.get();
      accountEmail = userInfoResponse.data.email || null;
      accountName = userInfoResponse.data.name || null;
      calendarOAuthDebug('🔍 [DEBUG] Google user info:', {
        email: accountEmail,
        name: accountName,
      });
    } catch (userInfoError) {
      calendarOAuthError(
        '⚠️ [DEBUG] Failed to fetch Google user info:',
        userInfoError
      );
      // Continue without user info - token will still be saved
    }

    calendarOAuthDebug('🔍 [DEBUG] Checking for existing tokens...');
    // Check if this specific Google account is already connected
    // For multi-account support, we check by account_email if available
    let existingToken = null;
    let fetchError = null;

    if (accountEmail) {
      // Multi-account: Check for existing token with same email
      const result = await supabase
        .from('calendar_auth_tokens')
        .select('*')
        .eq('user_id', user.id)
        .eq('ws_id', wsId)
        .eq('provider', 'google')
        .eq('account_email', accountEmail)
        .single();
      existingToken = result.data;
      fetchError = result.error;
    } else {
      // Fallback: Check for any Google token without email (legacy)
      const result = await supabase
        .from('calendar_auth_tokens')
        .select('*')
        .eq('user_id', user.id)
        .eq('ws_id', wsId)
        .eq('provider', 'google')
        .is('account_email', null)
        .single();
      existingToken = result.data;
      fetchError = result.error;
    }

    calendarOAuthDebug('🔍 [DEBUG] Existing token check:', {
      hasExistingToken: !!existingToken,
      hasError: !!fetchError,
      errorCode: fetchError?.code,
      errorMessage: fetchError?.message,
    });

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 means no rows found
      calendarOAuthError(
        '❌ [DEBUG] Error fetching existing token:',
        fetchError
      );
      return NextResponse.json(
        { error: 'Failed to fetch existing token' },
        { status: 500 }
      );
    }

    const receivedRefreshToken =
      typeof tokens.refresh_token === 'string' && tokens.refresh_token.trim()
        ? tokens.refresh_token
        : null;
    // Asking again with consent makes Google issue a new refresh token.
    const askAgainWithConsent = async () => {
      const admission = await admitGoogleConsentRestart({
        userId: user.id,
        wsId,
        account:
          existingToken?.id ??
          accountEmail?.trim().toLowerCase() ??
          'unknown-account',
        clientSecret: oauthConfig.config.clientSecret,
      });
      if (admission.kind !== 'allowed') {
        const t = await getTranslations({
          locale: resolveCalendarLocale(request),
          namespace: 'calendar',
        });
        const unavailable = admission.kind === 'unavailable';
        return NextResponse.json(
          {
            code: unavailable
              ? 'google_calendar_consent_restart_unavailable'
              : 'google_calendar_consent_restart_limited',
            error: t(
              unavailable
                ? 'consent_restart_unavailable'
                : 'consent_restart_limited'
            ),
          },
          {
            status: unavailable ? 503 : 429,
            headers: {
              'Retry-After': String(admission.retryAfterSeconds),
              'Cache-Control': 'no-store',
            },
          }
        );
      }
      return NextResponse.redirect(
        buildGoogleCalendarAuthUrl({
          request,
          userId: user.id,
          wsId,
          clientId: oauthConfig.config.clientId,
          clientSecret: oauthConfig.config.clientSecret,
          consent: true,
        })
      );
    };
    // A quarantined row's stored refresh token is the one Google rejected;
    // never revive it.
    if (
      !receivedRefreshToken &&
      existingToken?.is_active === false &&
      existingToken.deactivated_reason
    )
      return askAgainWithConsent();

    const refreshToken =
      receivedRefreshToken ||
      (typeof existingToken?.refresh_token === 'string' &&
      existingToken.refresh_token.trim()
        ? existingToken.refresh_token
        : null);

    if (!refreshToken) {
      calendarOAuthError(
        '❌ [DEBUG] No refresh token available for Google Calendar OAuth'
      );
      return NextResponse.json(
        { error: 'No refresh token received' },
        { status: 500 }
      );
    }

    const oauthCredentials = {
      ...tokens,
      refresh_token: refreshToken,
    };

    if (existingToken) {
      calendarOAuthDebug('🔍 [DEBUG] Updating existing token...');
      // Update existing token
      const { error: updateError, matched } = await reactivateCalendarAuthToken(
        supabase,
        existingToken.id,
        {
          access_token: tokens.access_token,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          account_name: accountName,
        },
        // Reusing the stored token is only safe if sync has not rejected
        // it since this callback read the row.
        receivedRefreshToken
          ? undefined
          : { createdAt: existingToken.created_at }
      );

      if (updateError) {
        calendarOAuthError('❌ [DEBUG] Error updating token:', updateError);
        return NextResponse.json(
          { error: 'Failed to update token' },
          { status: 500 }
        );
      }
      if (!receivedRefreshToken && !matched) return askAgainWithConsent();
      calendarOAuthDebug('✅ [DEBUG] Token updated successfully');
    } else {
      calendarOAuthDebug('🔍 [DEBUG] Inserting new token...');
      // Insert new token with multi-account fields
      const { error: insertError } = await supabase
        .from('calendar_auth_tokens')
        .insert({
          user_id: user.id,
          ws_id: wsId,
          provider: 'google',
          access_token: tokens.access_token,
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
      calendarOAuthDebug('✅ [DEBUG] Token inserted successfully');
    }

    // Perform full sync after successful authentication
    try {
      calendarOAuthDebug(
        `[${wsId}] Starting full sync after Google Calendar connection...`
      );

      const performFullSyncForWorkspace =
        await loadPerformFullSyncForWorkspace();

      // Test if the function is available
      calendarOAuthDebug(
        '🔍 [DEBUG] Testing performFullSyncForWorkspace availability:',
        {
          functionType: typeof performFullSyncForWorkspace,
          isFunction: typeof performFullSyncForWorkspace === 'function',
        }
      );

      // Test Google Calendar API credentials
      calendarOAuthDebug(
        '🔍 [DEBUG] Testing Google Calendar API credentials:',
        {
          hasClientId: !!process.env.GOOGLE_CLIENT_ID,
          hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
          hasRedirectUri: !!process.env.GOOGLE_REDIRECT_URI,
          accessTokenLength: tokens.access_token?.length || 0,
          refreshTokenLength: refreshToken?.length || 0,
        }
      );

      const events = await performFullSyncForWorkspace(
        'primary',
        wsId,
        tokens.access_token,
        refreshToken
      );
      calendarOAuthDebug(
        'Full sync completed successfully after Google Calendar connection',
        { wsId, eventCount: events.length }
      );
    } catch (syncError) {
      calendarOAuthError(
        'Error performing full sync after Google Calendar connection',
        {
          wsId,
          error:
            syncError instanceof Error ? syncError.message : 'Unknown error',
          stack: syncError instanceof Error ? syncError.stack : undefined,
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!refreshToken,
        }
      );
      // Don't fail the authentication flow if sync fails
    }

    // Auto-add all calendars to calendar_connections after successful authentication
    try {
      calendarOAuthDebug('🔍 [DEBUG] Fetching user calendars to auto-add...');

      // Get the newly inserted/updated token ID
      let tokenQuery = supabase
        .from('calendar_auth_tokens')
        .select('id')
        .eq('user_id', user.id)
        .eq('ws_id', wsId)
        .eq('provider', 'google')
        .eq('is_active', true);

      if (accountEmail) {
        tokenQuery = tokenQuery.eq('account_email', accountEmail);
      } else {
        tokenQuery = tokenQuery.is('account_email', null);
      }

      const { data: tokenRecord } = await tokenQuery.single();

      if (tokenRecord?.id) {
        // Create calendar client with the new tokens
        auth.setCredentials(oauthCredentials);
        const calendar = google.calendar({ version: 'v3', auth });

        // Fetch all calendars for this account
        const calendarListResponse = await calendar.calendarList.list({
          minAccessRole: 'reader',
          showHidden: false,
          showDeleted: false,
        });

        const calendars = calendarListResponse.data.items || [];
        calendarOAuthDebug(
          `🔍 [DEBUG] Found ${calendars.length} calendars to add`
        );

        if (calendars.length > 0) {
          // Prepare connections for batch upsert
          const connectionsToUpsert = calendars
            .filter((cal) => cal.id)
            .map((cal) => ({
              ws_id: wsId,
              calendar_id: cal.id!,
              calendar_name: cal.summary || 'Untitled Calendar',
              is_enabled: true,
              color: cal.backgroundColor || '#4285F4',
              auth_token_id: tokenRecord.id,
              provider: 'google',
            }));

          // Batch upsert into calendar_connections
          // We use onConflict to handle existing connections
          const { error: upsertError } = await supabase
            .from('calendar_connections')
            .upsert(connectionsToUpsert, {
              onConflict: 'ws_id, calendar_id',
            });

          if (upsertError) {
            calendarOAuthError(
              '⚠️ [DEBUG] Failed to batch upsert calendar connections:',
              upsertError
            );
          } else {
            calendarOAuthDebug(
              `✅ [DEBUG] Successfully batched upserted ${connectionsToUpsert.length} calendars`
            );
          }
        }
      }
    } catch (calendarAddError) {
      calendarOAuthError(
        '⚠️ [DEBUG] Error auto-adding calendars:',
        calendarAddError
      );
      // Don't fail the authentication flow if calendar add fails
    }

    calendarOAuthDebug('🔍 [DEBUG] Redirecting to calendar page...');
    // Redirect to the calendar page with success indicator
    return NextResponse.redirect(
      buildCalendarPostAuthRedirectUrl(runtime.publicOrigin, wsId, {
        provider: 'google',
        connected: 'true',
      }),
      302
    );
  } catch (error) {
    calendarOAuthError('❌ [DEBUG] Error during OAuth callback:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'authentication failed' },
      { status: 500 }
    );
  }
}
