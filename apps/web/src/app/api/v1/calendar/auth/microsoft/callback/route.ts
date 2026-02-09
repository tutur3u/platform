import {
  ConfidentialClientApplication,
  createGraphClient,
  createMsalConfig,
  MICROSOFT_CALENDAR_SCOPES,
} from '@tuturuuu/microsoft';
import { fetchMicrosoftCalendars } from '@tuturuuu/microsoft/calendar';
import { createClient } from '@tuturuuu/supabase/next/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getMicrosoftOAuthConfig,
  isMicrosoftConfigComplete,
} from '@/lib/calendar/microsoft-config';

const microsoftCallbackQuerySchema = z.object({
  code: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  error: z.string().optional().nullable(),
  error_description: z.string().optional().nullable(),
});

export async function GET(request: Request): Promise<NextResponse> {
  console.log('🔍 [DEBUG] Microsoft OAuth callback route called');

  const url = new URL(request.url);
  const queryParams = Object.fromEntries(url.searchParams.entries());

  const result = microsoftCallbackQuerySchema.safeParse(queryParams);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid callback parameters' },
      { status: 400 }
    );
  }

  const { code, state: wsId, error, error_description } = result.data;

  if (error) {
    console.error(
      '❌ [DEBUG] Microsoft OAuth error:',
      error,
      error_description
    );
    // Safe redirect URL construction
    const redirectUrl = wsId
      ? new URL(`/${wsId}/calendar`, request.url)
      : new URL('/', request.url);
    redirectUrl.searchParams.set('error', 'microsoft_auth_failed');
    redirectUrl.searchParams.set(
      'message',
      error_description || error || 'Unknown error'
    );

    return NextResponse.redirect(redirectUrl, 302);
  }

  if (!wsId) {
    console.log('❌ [DEBUG] Missing wsId in callback');
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  if (!code) {
    console.log('❌ [DEBUG] Missing code in callback');
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  // Retrieve the PKCE code verifier from the cookie
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get('ms_pkce_verifier')?.value;

  if (!codeVerifier) {
    console.error('❌ [DEBUG] Missing PKCE code verifier');
    const redirectUrl = new URL(`/${wsId}/calendar`, request.url);
    redirectUrl.searchParams.set('error', 'microsoft_auth_failed');
    redirectUrl.searchParams.set(
      'message',
      'PKCE verification failed. Please try again.'
    );
    return NextResponse.redirect(redirectUrl, 302);
  }

  const config = getMicrosoftOAuthConfig();

  if (!isMicrosoftConfigComplete(config)) {
    return NextResponse.json(
      { error: 'Microsoft OAuth not configured' },
      { status: 500 }
    );
  }

  try {
    console.log('🔍 [DEBUG] Creating MSAL client...');
    const msalConfig = createMsalConfig(config);
    const cca = new ConfidentialClientApplication(msalConfig);

    console.log('🔍 [DEBUG] Exchanging authorization code for tokens...');
    const tokenResponse = await cca.acquireTokenByCode({
      code,
      scopes: MICROSOFT_CALENDAR_SCOPES,
      redirectUri: config.redirectUri,
      codeVerifier, // Include the PKCE code verifier
    });

    if (!tokenResponse) {
      console.log('❌ [DEBUG] No token response from Microsoft');
      return NextResponse.json(
        { error: 'No token received from Microsoft' },
        { status: 500 }
      );
    }

    console.log('🔍 [DEBUG] Token exchange result:', {
      hasAccessToken: !!tokenResponse.accessToken,
      hasAccount: !!tokenResponse.account,
      expiresOn: tokenResponse.expiresOn,
    });

    // Get user info from Microsoft Graph
    console.log('🔍 [DEBUG] Fetching user info from Microsoft Graph...');
    const graphClient = createGraphClient(tokenResponse.accessToken);
    const userInfo = await graphClient.api('/me').get();

    const accountEmail =
      userInfo.mail ||
      userInfo.userPrincipalName ||
      tokenResponse.account?.username;
    const accountName = userInfo.displayName || tokenResponse.account?.name;

    console.log('🔍 [DEBUG] User info:', {
      email: accountEmail,
      name: accountName,
    });

    // Initialize Supabase client
    console.log('🔍 [DEBUG] Creating Supabase client...');
    const supabase = await createClient(request);

    // Get the current authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log('❌ [DEBUG] User not authenticated');
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    // Check if this Microsoft account is already connected
    console.log('🔍 [DEBUG] Checking for existing Microsoft token...');
    const { data: existingToken, error: fetchError } = await supabase
      .from('calendar_auth_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('ws_id', wsId)
      .eq('provider', 'microsoft')
      .eq('account_email', accountEmail)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('❌ [DEBUG] Error fetching existing token:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch existing token' },
        { status: 500 }
      );
    }

    // Prepare token data
    // Note: Microsoft doesn't return refresh_token directly in acquireTokenByCode
    // We need to get it from the account cache or request offline_access scope
    const refreshToken = ''; // Microsoft handles refresh internally via MSAL cache
    const expiresAt = tokenResponse.expiresOn?.toISOString() || null;

    if (existingToken) {
      console.log('🔍 [DEBUG] Updating existing Microsoft token...');
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
        console.error('❌ [DEBUG] Error updating token:', updateError);
        return NextResponse.json(
          { error: 'Failed to update token' },
          { status: 500 }
        );
      }
      console.log('✅ [DEBUG] Microsoft token updated successfully');
    } else {
      console.log('🔍 [DEBUG] Inserting new Microsoft token...');
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
        console.error('❌ [DEBUG] Error inserting token:', insertError);
        return NextResponse.json(
          { error: 'Failed to insert token' },
          { status: 500 }
        );
      }
      console.log('✅ [DEBUG] Microsoft token inserted successfully');
    }

    // Auto-add all calendars to calendar_connections after successful authentication
    try {
      console.log('🔍 [DEBUG] Fetching Microsoft calendars to auto-add...');

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
        console.log(
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
            }));

          // Batch upsert into calendar_connections
          const { error: upsertError } = await supabase
            .from('calendar_connections')
            .upsert(connectionsToUpsert, {
              onConflict: 'ws_id, calendar_id',
            });

          if (upsertError) {
            console.error(
              '⚠️ [DEBUG] Failed to batch upsert Microsoft calendar connections:',
              upsertError
            );
          } else {
            console.log(
              `✅ [DEBUG] Successfully batched upserted ${connectionsToUpsert.length} Microsoft calendars`
            );
          }
        }
      }
    } catch (calendarAddError) {
      console.error(
        '⚠️ [DEBUG] Error auto-adding Microsoft calendars:',
        calendarAddError
      );
      // Don't fail the authentication flow if calendar add fails
    }

    console.log('🔍 [DEBUG] Redirecting to calendar page...');

    // Create redirect response and clear the PKCE cookie
    const redirectUrl = new URL(`/${wsId}/calendar`, request.url);
    redirectUrl.searchParams.set('provider', 'microsoft');
    redirectUrl.searchParams.set('connected', 'true');

    const redirectResponse = NextResponse.redirect(redirectUrl, 302);

    // Clear the PKCE verifier cookie
    redirectResponse.cookies.delete('ms_pkce_verifier');

    return redirectResponse;
  } catch (error) {
    console.error('❌ [DEBUG] Error during Microsoft OAuth callback:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
