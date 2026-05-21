import { performFullSyncForWorkspace } from '@tuturuuu/trigger/google-calendar-full-sync';
import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const fullSyncSchema = z.object({
  wsId: z.string().max(MAX_NAME_LENGTH),
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
    const authContext = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: 'calendar' },
    });

    if (!authContext.ok) return authContext.response;
    const { supabase, user } = authContext;
    const wsId = await normalizeWorkspaceId(id, supabase);

    const memberCheck = await verifyWorkspaceMembershipType({
      wsId,
      userId: user.id,
      supabase,
    });
    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }
    if (!memberCheck.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
