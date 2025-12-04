import { createClient } from '@tuturuuu/supabase/next/server';
import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';

/**
 * Normalizes workspace ID from slug to UUID for API routes
 */
async function normalizeWorkspaceId(wsId: string): Promise<string> {
  if (wsId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('id, workspace_members!inner(user_id)')
      .eq('personal', true)
      .eq('workspace_members.user_id', user.id)
      .maybeSingle();

    if (error || !workspace) {
      throw new Error('Personal workspace not found');
    }

    return workspace.id;
  }
  return resolveWorkspaceId(wsId);
}

/**
 * GET /api/v1/live/session?wsId=...
 * Retrieve stored session handle for resumption
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wsId = searchParams.get('wsId');

    if (!wsId) {
      return Response.json({ error: 'Missing wsId parameter' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let normalizedWsId: string;
    try {
      normalizedWsId = await normalizeWorkspaceId(wsId);
    } catch {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Note: The 'live_api_sessions' table type will be available after running
    // migrations (bun sb:up) and regenerating types (bun sb:typegen)
    const { data, error } = await (supabase as Awaited<ReturnType<typeof createClient>>)
      .from('live_api_sessions' as never)
      .select('session_handle, expires_at')
      .eq('user_id', user.id)
      .eq('ws_id', normalizedWsId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) {
      console.error('[Session API] Error fetching session:', error);
      return Response.json({ sessionHandle: null });
    }

    const sessionData = data as { session_handle?: string } | null;
    return Response.json({ sessionHandle: sessionData?.session_handle || null });
  } catch (error) {
    console.error('[Session API] Unexpected error in GET:', error);
    return Response.json({ sessionHandle: null });
  }
}

/**
 * POST /api/v1/live/session
 * Store/update session handle for resumption
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sessionHandle, wsId } = body as {
      sessionHandle: string;
      wsId: string;
    };

    if (!sessionHandle || !wsId) {
      return Response.json(
        { error: 'Missing required fields: sessionHandle, wsId' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let normalizedWsId: string;
    try {
      normalizedWsId = await normalizeWorkspaceId(wsId);
    } catch {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Session handles are valid for 2 hours per Gemini API docs
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    // Note: The 'live_api_sessions' table type will be available after running
    // migrations (bun sb:up) and regenerating types (bun sb:typegen)
    const { error } = await (supabase as Awaited<ReturnType<typeof createClient>>)
      .from('live_api_sessions' as never)
      .upsert(
        {
          user_id: user.id,
          ws_id: normalizedWsId,
          session_handle: sessionHandle,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'user_id,ws_id' }
      );

    if (error) {
      console.error('[Session API] Error storing session:', error);
      return Response.json(
        { error: 'Failed to store session handle' },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[Session API] Unexpected error in POST:', error);
    return Response.json(
      { error: 'Failed to store session handle' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/live/session?wsId=...
 * Clear session handle (e.g., on explicit disconnect)
 */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wsId = searchParams.get('wsId');

    if (!wsId) {
      return Response.json({ error: 'Missing wsId parameter' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let normalizedWsId: string;
    try {
      normalizedWsId = await normalizeWorkspaceId(wsId);
    } catch {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Note: The 'live_api_sessions' table type will be available after running
    // migrations (bun sb:up) and regenerating types (bun sb:typegen)
    const { error } = await (supabase as Awaited<ReturnType<typeof createClient>>)
      .from('live_api_sessions' as never)
      .delete()
      .eq('user_id', user.id)
      .eq('ws_id', normalizedWsId);

    if (error) {
      console.error('[Session API] Error deleting session:', error);
      return Response.json(
        { error: 'Failed to delete session handle' },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[Session API] Unexpected error in DELETE:', error);
    return Response.json(
      { error: 'Failed to delete session handle' },
      { status: 500 }
    );
  }
}
