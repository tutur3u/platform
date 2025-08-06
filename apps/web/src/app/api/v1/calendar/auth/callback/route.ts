import { OAuth2Client } from '@tuturuuu/google';
import { createClient } from '@tuturuuu/supabase/next/server';
import { performFullSyncForWorkspace } from '@tuturuuu/trigger';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const wsId = url.searchParams.get('state');

  if (!wsId) {
    return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  const auth = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  });

  try {
    // Exchange the authorization code for tokens
    const { tokens } = await auth.getToken(code);

    if (!tokens.access_token) {
      return NextResponse.json(
        { error: 'No access token received' },
        { status: 500 }
      );
    }

    const refreshToken = tokens.refresh_token ?? '';

    // Initialize Supabase client with cookies to access the current session
    const supabase = await createClient();

    // Get the current authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    // Check if tokens already exist for this user
    const { data: existingToken, error: fetchError } = await supabase
      .from('calendar_auth_tokens')
      .select('*')
      .eq('user_id', user.id)
      .eq('ws_id', wsId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 means no rows found
      console.error('Error fetching existing token:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch existing token' },
        { status: 500 }
      );
    }

    if (existingToken) {
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
        console.error('Error updating token:', updateError);
        return NextResponse.json(
          { error: 'Failed to update token' },
          { status: 500 }
        );
      }
    } else {
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
        console.error('Error inserting token:', insertError);
        return NextResponse.json(
          { error: 'Failed to insert token' },
          { status: 500 }
        );
      }
    }

    // Perform full sync after successful authentication
    try {
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
      console.warn(
        `[${wsId}] Error performing full sync after Google Calendar connection:`,
        syncError
      );
      // Don't fail the authentication flow if sync fails
    }

    // Redirect to the calendar page without tokens in the URL
    return NextResponse.redirect(
      new URL(`/${wsId}/calendar`, request.url),
      302
    );
  } catch (error) {
    console.error('Error during OAuth callback:', error);
    return NextResponse.json(
      { error: 'authentication failed' },
      { status: 500 }
    );
  }
}
