import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  getPermissions,
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import {
  handleEditAction,
  handlePauseAction,
  handleResumeAction,
  handleStopAction,
  type PatchSessionBody,
  patchSessionBodySchema,
  type SessionRecord,
} from './helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; sessionId: string }> }
) {
  try {
    const { wsId, sessionId } = await params;
    const authResult = await authenticateAndResolveWorkspace(request, wsId);
    if ('error' in authResult) {
      return authResult.error;
    }
    const { user, normalizedWsId } = authResult;
    const sbAdmin = await createAdminClient();

    const { data, error } = await sbAdmin
      .from('time_tracking_sessions')
      .select(
        `
        *,
        category:time_tracking_categories(*),
        task:tasks(*)
      `
      )
      .eq('id', sessionId)
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ session: data });
  } catch (error) {
    console.error('Error fetching time tracking session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; sessionId: string }> }
) {
  try {
    const { wsId, sessionId } = await params;
    const authResult = await authenticateAndResolveWorkspace(request, wsId);
    if ('error' in authResult) {
      return authResult.error;
    }
    const { user, normalizedWsId } = authResult;

    const bodyResult = patchSessionBodySchema.safeParse(await request.json());
    if (!bodyResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: bodyResult.error.flatten(),
        },
        { status: 400 }
      );
    }
    const body: PatchSessionBody = bodyResult.data;

    const sbAdmin = await createAdminClient();

    console.log('[DEBUG] Looking up session:', {
      sessionId,
      normalizedWsId,
      userId: user.id,
      originalWsId: wsId,
    });

    let session = await sbAdmin
      .from('time_tracking_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => data);

    if (!session) {
      // Fallback: try with original wsId (for sessions created before fix)
      const { data: fallbackSession, error: fallbackError } = await sbAdmin
        .from('time_tracking_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('ws_id', wsId) // Use original wsId from URL
        .eq('user_id', user.id)
        .maybeSingle();

      if (fallbackError || !fallbackSession) {
        console.log(
          '[DEBUG PATCH] Session not found with either normalized or original wsId'
        );
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }

      console.log('[DEBUG PATCH] Found session with original wsId fallback');
      session = fallbackSession;
    }

    const permissions = await getPermissions({ wsId: normalizedWsId, request });
    if (!permissions) {
      return NextResponse.json(
        { error: 'Permissions not found' },
        { status: 403 }
      );
    }
    const canBypass = permissions.containsPermission(
      'bypass_time_tracking_request_approval'
    );

    if (session.is_running === null) {
      return NextResponse.json(
        { error: 'Session running state is invalid' },
        { status: 500 }
      );
    }
    const sessionRecord: SessionRecord = {
      ...session,
      is_running: session.is_running,
    };
    switch (body.action) {
      case 'stop':
        return await handleStopAction({
          sbAdmin,
          session: sessionRecord,
          sessionId,
          normalizedWsId,
          canBypass,
        });
      case 'pause':
        return await handlePauseAction({
          sbAdmin,
          session: sessionRecord,
          sessionId,
          normalizedWsId,
          userId: user.id,
          canBypass,
          requestBody: body,
        });
      case 'resume':
        return await handleResumeAction({
          sbAdmin,
          session: sessionRecord,
          sessionId,
          normalizedWsId,
          userId: user.id,
        });
      case 'edit':
        return await handleEditAction({
          sbAdmin,
          session: sessionRecord,
          sessionId,
          normalizedWsId,
          canBypass,
          requestBody: body,
        });
      default:
        return NextResponse.json(
          { error: `Unsupported action` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error updating time tracking session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; sessionId: string }> }
) {
  try {
    const { wsId, sessionId } = await params;
    const authResult = await authenticateAndResolveWorkspace(request, wsId);
    if ('error' in authResult) {
      return authResult.error;
    }
    const { user, normalizedWsId } = authResult;
    const sbAdmin = await createAdminClient();

    console.log('[DEBUG DELETE] Looking up session:', {
      sessionId,
      normalizedWsId,
      userId: user.id,
      originalWsId: wsId,
    });

    let session = await sbAdmin
      .from('time_tracking_sessions')
      .select('id, ws_id, user_id')
      .eq('id', sessionId)
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => data);

    if (!session) {
      // Fallback: try with original wsId (for sessions created before fix)
      const { data: fallbackSession, error: fallbackError } = await sbAdmin
        .from('time_tracking_sessions')
        .select('id, ws_id, user_id')
        .eq('id', sessionId)
        .eq('ws_id', wsId) // Use original wsId from URL
        .eq('user_id', user.id)
        .maybeSingle();

      if (fallbackError || !fallbackSession) {
        console.log(
          '[DEBUG DELETE] Session not found with either normalized or original wsId'
        );
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }

      console.log('[DEBUG DELETE] Found session with original wsId fallback');
      session = fallbackSession;
    }

    const permissions = await getPermissions({ wsId: normalizedWsId, request });
    if (!permissions) {
      return NextResponse.json(
        { error: 'Permissions not found' },
        { status: 403 }
      );
    }

    // Use the session's actual ws_id for deletion (handles fallback case)
    const sessionWsId = session.ws_id;

    console.log('[DEBUG DELETE] Attempting delete with ws_id:', sessionWsId);

    const { data: deletedRows, error } = await sbAdmin
      .from('time_tracking_sessions')
      .delete()
      .select('id')
      .eq('id', sessionId)
      .eq('ws_id', sessionWsId)
      .eq('user_id', user.id);

    if (error) {
      console.error('[DEBUG DELETE] Delete error:', error);
      throw error;
    }

    console.log('[DEBUG DELETE] Deleted rows:', deletedRows);

    if (!deletedRows || deletedRows.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting time tracking session:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function authenticateAndResolveWorkspace(
  request: NextRequest,
  wsId: string
): Promise<
  | {
      supabase: TypedSupabaseClient;
      user: SupabaseUser;
      normalizedWsId: string;
    }
  | { error: NextResponse }
> {
  const supabase = await createClient(request);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);
  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  let normalizedWsId: string;
  try {
    normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  } catch {
    return {
      error: NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      ),
    };
  }
  if (!normalizedWsId) {
    return {
      error: NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      ),
    };
  }

  const memberCheck = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId: user.id,
    supabase: supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!memberCheck.ok) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  return { supabase, user, normalizedWsId };
}
