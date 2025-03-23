import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
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

    // Fetch the user's tokens from the calendar_auth_tokens table
    const { data: tokenData, error: tokenError } = await supabase
      .from('calendar_auth_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .single();

    if (tokenError) {
      if (tokenError.code === 'PGRST116') {
        // No tokens found for the user
        return NextResponse.json({ tokens: null }, { status: 200 });
      }
      console.error('Error fetching tokens:', tokenError);
      return NextResponse.json(
        { error: 'Failed to fetch tokens' },
        { status: 500 }
      );
    }

    if (!tokenData) {
      return NextResponse.json({ tokens: null }, { status: 200 });
    }

    const tokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || undefined,
    };

    return NextResponse.json({ tokens }, { status: 200 });
  } catch (error) {
    console.error('Error in /api/v1/calendar/auth/tokens:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
