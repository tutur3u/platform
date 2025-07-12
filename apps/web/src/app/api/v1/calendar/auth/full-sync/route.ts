import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { performFullSyncForWorkspace } from '@tuturuuu/trigger/google-calendar-full-sync';

export async function POST(request: Request) {
  try {
    const { wsId } = await request.json();

    if (!wsId) {
      return NextResponse.json(
        { error: 'wsId is required' },
        { status: 400 }
      );
    }

    // Initialize Supabase client
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

    // Get the Google tokens for this workspace
    const { data: googleTokens, error: tokensError } = await supabase
      .from('calendar_auth_tokens')
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .eq('ws_id', wsId)
      .single();

    if (tokensError || !googleTokens?.access_token) {
      return NextResponse.json(
        { error: 'Google Calendar not connected for this workspace' },
        { status: 400 }
      );
    }

    // Perform the full sync directly
    const events = await performFullSyncForWorkspace(
      'primary',
      wsId,
      googleTokens.access_token,
      googleTokens.refresh_token
    );

    return NextResponse.json({
      success: true,
      message: 'Full sync completed successfully',
      eventsSynced: events.length
    });

  } catch (error) {
    console.error('Error performing full sync:', error);
    return NextResponse.json(
      { 
        error: 'Failed to perform full sync',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 