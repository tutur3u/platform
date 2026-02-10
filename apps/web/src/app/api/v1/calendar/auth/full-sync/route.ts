import { createClient } from '@tuturuuu/supabase/next/server';
import { performFullSyncForWorkspace } from '@tuturuuu/trigger/google-calendar-full-sync';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const fullSyncSchema = z.object({
  wsId: z.string(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = fullSyncSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'wsId is required and must be a string' },
        { status: 400 }
      );
    }

    const { wsId: id } = result.data;

    // Fetch workspace using the standardized utility
    // This resolves special IDs like 'personal' and ensures existence
    const workspace = await getWorkspace(id);

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    const wsId = workspace.id;

    // Initialize Supabase client
    const supabase = await createClient(request);

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
      eventsSynced: events.length,
    });
  } catch (error) {
    console.error('Error performing full sync:', error);
    return NextResponse.json(
      {
        error: 'Failed to perform full sync',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
