/**
 * Microsoft OAuth Callback Route
 *
 * Handles the OAuth callback from Microsoft, exchanges code for tokens,
 * fetches user info, and stores tokens in the database.
 */

import {
  ConfidentialClientApplication,
  createGraphClient,
  createMsalConfig,
  MICROSOFT_CALENDAR_SCOPES,
  type MicrosoftOAuthConfig,
} from '@tuturuuu/microsoft';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  console.log('🔍 [DEBUG] Microsoft OAuth callback route called');

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const wsId = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  if (error) {
    console.error('❌ [DEBUG] Microsoft OAuth error:', error, errorDescription);
    return NextResponse.redirect(
      new URL(
        `/${wsId}/calendar?error=microsoft_auth_failed&message=${encodeURIComponent(errorDescription || error)}`,
        request.url
      ),
      302
    );
  }

  if (!wsId) {
    console.log('❌ [DEBUG] Missing wsId in callback');
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  if (!code) {
    console.log('❌ [DEBUG] Missing code in callback');
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  const config: MicrosoftOAuthConfig = {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || '',
  };

  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
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
    const supabase = await createClient();

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

    console.log('🔍 [DEBUG] Redirecting to calendar page...');
    return NextResponse.redirect(
      new URL(
        `/${wsId}/calendar?provider=microsoft&connected=true`,
        request.url
      ),
      302
    );
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
