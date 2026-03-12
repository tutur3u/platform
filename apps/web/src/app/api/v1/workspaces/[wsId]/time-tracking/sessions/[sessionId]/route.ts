import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  getPermissions,
  normalizeWorkspaceId,
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
    const { supabase, user, normalizedWsId } = authResult;

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

    const { data: session, error: sessionError } = await sbAdmin
      .from('time_tracking_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
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
          supabase,
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

    const { data: session, error: sessionError } = await sbAdmin
      .from('time_tracking_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (sessionError) {
      throw sessionError;
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const permissions = await getPermissions({ wsId: normalizedWsId, request });
    if (!permissions) {
      return NextResponse.json(
        { error: 'Permissions not found' },
        { status: 403 }
      );
    }
    const { error } = await sbAdmin
      .from('time_tracking_sessions')
      .delete()
      .eq('id', sessionId)
      .eq('ws_id', normalizedWsId);

    if (error) throw error;

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
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
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

  const { data: memberCheck } = await supabase
    .from('workspace_members')
    .select('id:user_id')
    .eq('ws_id', normalizedWsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!memberCheck) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  return { supabase, user, normalizedWsId };
}
