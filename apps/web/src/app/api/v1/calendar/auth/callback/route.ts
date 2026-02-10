import { google, OAuth2Client } from '@tuturuuu/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { performFullSyncForWorkspace } from '@tuturuuu/trigger';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  console.log('🔍 [DEBUG] OAuth callback route called');

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const wsId = url.searchParams.get('state');

  console.log('🔍 [DEBUG] OAuth callback parameters:', {
    hasCode: !!code,
    wsId,
    url: request.url,
  });

  if (!wsId) {
    console.log('❌ [DEBUG] Missing wsId in callback');
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  if (!code) {
    console.log('❌ [DEBUG] Missing code in callback');
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  console.log('🔍 [DEBUG] Creating OAuth2Client...');
  const auth = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });

  try {
    console.log('🔍 [DEBUG] Exchanging authorization code for tokens...');
    // Exchange the authorization code for tokens
    const { tokens } = await auth.getToken(code);

    console.log('🔍 [DEBUG] Token exchange result:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      tokenType: tokens.token_type,
      expiryDate: tokens.expiry_date,
    });

    if (!tokens.access_token) {
      console.log('❌ [DEBUG] No access token received from Google');
      return NextResponse.json(
        { error: 'No access token received' },
        { status: 500 }
      );
    }

    const refreshToken = tokens.refresh_token ?? '';
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : null;

    // Fetch user info from Google to get account email
    console.log('🔍 [DEBUG] Fetching Google user info...');
    auth.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth });
    let accountEmail: string | null = null;
    let accountName: string | null = null;

    try {
      const userInfoResponse = await oauth2.userinfo.get();
      accountEmail = userInfoResponse.data.email || null;
      accountName = userInfoResponse.data.name || null;
      console.log('🔍 [DEBUG] Google user info:', {
        email: accountEmail,
        name: accountName,
      });
    } catch (userInfoError) {
      console.error(
        '⚠️ [DEBUG] Failed to fetch Google user info:',
        userInfoError
      );
      // Continue without user info - token will still be saved
    }

    console.log('🔍 [DEBUG] Creating Supabase client...');
    // Initialize Supabase client with cookies to access the current session
    const supabase = await createClient(request);
    console.log('✅ [DEBUG] Supabase client created');

    console.log('🔍 [DEBUG] Getting current user...');
    // Get the current authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    console.log('🔍 [DEBUG] User auth result:', {
      hasUser: !!user,
      userId: user?.id,
      hasError: !!userError,
      errorMessage: userError?.message,
    });

    if (userError || !user) {
      console.log('❌ [DEBUG] User not authenticated');
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    console.log('🔍 [DEBUG] Checking for existing tokens...');
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

    console.log('🔍 [DEBUG] Existing token check:', {
      hasExistingToken: !!existingToken,
      hasError: !!fetchError,
      errorCode: fetchError?.code,
      errorMessage: fetchError?.message,
    });

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 means no rows found
      console.error('❌ [DEBUG] Error fetching existing token:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch existing token' },
        { status: 500 }
      );
    }

    if (existingToken) {
      console.log('🔍 [DEBUG] Updating existing token...');
      // Update existing token
      const { error: updateError } = await supabase
        .from('calendar_auth_tokens')
        .update({
          access_token: tokens.access_token,
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
      console.log('✅ [DEBUG] Token updated successfully');
    } else {
      console.log('🔍 [DEBUG] Inserting new token...');
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
        console.error('❌ [DEBUG] Error inserting token:', insertError);
        return NextResponse.json(
          { error: 'Failed to insert token' },
          { status: 500 }
        );
      }
      console.log('✅ [DEBUG] Token inserted successfully');
    }

    // Perform full sync after successful authentication
    try {
      console.log(
        `[${wsId}] Starting full sync after Google Calendar connection...`
      );

      // Test if the function is available
      console.log(
        '🔍 [DEBUG] Testing performFullSyncForWorkspace availability:',
        {
          functionType: typeof performFullSyncForWorkspace,
          isFunction: typeof performFullSyncForWorkspace === 'function',
        }
      );

      // Test Google Calendar API credentials
      console.log('🔍 [DEBUG] Testing Google Calendar API credentials:', {
        hasClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        hasRedirectUri: !!process.env.GOOGLE_REDIRECT_URI,
        accessTokenLength: tokens.access_token?.length || 0,
        refreshTokenLength: refreshToken?.length || 0,
      });

      const events = await performFullSyncForWorkspace(
        'primary',
        wsId,
        tokens.access_token,
        refreshToken
      );
      console.log(
        'Full sync completed successfully after Google Calendar connection',
        { wsId, eventCount: events.length }
      );
    } catch (syncError) {
      console.error(
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
      console.log('🔍 [DEBUG] Fetching user calendars to auto-add...');

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
        auth.setCredentials(tokens);
        const calendar = google.calendar({ version: 'v3', auth });

        // Fetch all calendars for this account
        const calendarListResponse = await calendar.calendarList.list({
          minAccessRole: 'reader',
          showHidden: false,
          showDeleted: false,
        });

        const calendars = calendarListResponse.data.items || [];
        console.log(`🔍 [DEBUG] Found ${calendars.length} calendars to add`);

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
            }));

          // Batch upsert into calendar_connections
          // We use onConflict to handle existing connections
          const { error: upsertError } = await supabase
            .from('calendar_connections')
            .upsert(connectionsToUpsert, {
              onConflict: 'ws_id, calendar_id',
            });

          if (upsertError) {
            console.error(
              '⚠️ [DEBUG] Failed to batch upsert calendar connections:',
              upsertError
            );
          } else {
            console.log(
              `✅ [DEBUG] Successfully batched upserted ${connectionsToUpsert.length} calendars`
            );
          }
        }
      }
    } catch (calendarAddError) {
      console.error('⚠️ [DEBUG] Error auto-adding calendars:', calendarAddError);
      // Don't fail the authentication flow if calendar add fails
    }

    console.log('🔍 [DEBUG] Redirecting to calendar page...');
    // Redirect to the calendar page with success indicator
    return NextResponse.redirect(
      new URL(`/${wsId}/calendar?provider=google&connected=true`, request.url),
      302
    );
  } catch (error) {
    console.error('❌ [DEBUG] Error during OAuth callback:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: 'authentication failed' },
      { status: 500 }
    );
  }
}
