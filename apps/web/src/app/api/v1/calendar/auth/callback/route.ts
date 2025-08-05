import { createClient } from '@tuturuuu/supabase/next/server';
import { performFullSyncForWorkspace } from '@tuturuuu/trigger';
import { OAuth2Client } from 'google-auth-library';
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

    console.log('🔍 [DEBUG] Creating Supabase client...');
    // Initialize Supabase client with cookies to access the current session
    const supabase = await createClient();
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
    // Check if tokens already exist for this user
    const { data: existingToken, error: fetchError } = await supabase
      .from('calendar_auth_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('ws_id', wsId)
      .single();

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
      // Insert new token
      const { error: insertError } = await supabase
        .from('calendar_auth_tokens')
        .insert({
          user_id: user.id,
          ws_id: wsId,
          access_token: tokens.access_token,
          refresh_token: refreshToken,
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
        `[${wsId}] Full sync completed successfully after Google Calendar connection. Synced ${events.length} events.`
      );
    } catch (syncError) {
      console.error(
        `[${wsId}] Error performing full sync after Google Calendar connection:`,
        {
          error:
            syncError instanceof Error ? syncError.message : 'Unknown error',
          stack: syncError instanceof Error ? syncError.stack : undefined,
          wsId,
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!refreshToken,
        }
      );
      // Don't fail the authentication flow if sync fails
    }

    console.log('🔍 [DEBUG] Redirecting to calendar page...');
    // Redirect to the calendar page without tokens in the URL
    return NextResponse.redirect(
      new URL(`/${wsId}/calendar`, request.url),
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
