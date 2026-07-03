import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  isValidLiveSessionHandle,
  type LiveSessionScopeValidation,
  validateLiveSessionScopeKey,
} from '@/lib/live/session-scope';

/**
 * Normalizes workspace ID from slug to UUID for API routes
 */

function invalidScopeKeyResponse() {
  return Response.json({ error: 'Invalid scopeKey' }, { status: 400 });
}

async function verifyWorkspaceAccess({
  normalizedWsId,
  supabase,
  userId,
}: {
  normalizedWsId: string;
  supabase: TypedSupabaseClient;
  userId: string;
}) {
  const membership = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return Response.json(
      { error: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return Response.json(
      { error: 'You are not a member of this workspace' },
      { status: 403 }
    );
  }

  return null;
}

async function verifyLiveSessionScope({
  scope,
  supabase,
  userId,
}: {
  scope: Extract<LiveSessionScopeValidation, { valid: true }>;
  supabase: TypedSupabaseClient;
  userId: string;
}) {
  if (scope.kind === 'fixed') {
    return null;
  }

  const { data, error } = await supabase
    .from('ai_chats')
    .select('id')
    .eq('id', scope.chatId)
    .eq('creator_id', userId)
    .maybeSingle();

  if (error != null) {
    serverLogger.error(
      '[Session API] Error verifying assistant live chat scope',
      error
    );
    return Response.json(
      { error: 'Failed to verify live session scope' },
      { status: 500 }
    );
  }

  if (data == null) {
    return Response.json({ error: 'Invalid scopeKey' }, { status: 403 });
  }

  return null;
}

/**
 * GET /api/v1/live/session?wsId=...&scopeKey=...
 * Retrieve stored session handle for resumption
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wsId = searchParams.get('wsId');
    const scopeKey = searchParams.get('scopeKey');
    const scope = validateLiveSessionScopeKey(scopeKey);

    if (!wsId || !scopeKey) {
      return Response.json(
        { error: 'Missing wsId or scopeKey parameter' },
        { status: 400 }
      );
    }

    if (!scope.valid) {
      return invalidScopeKeyResponse();
    }

    const supabase = await createClient(req);
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let normalizedWsId: string;
    try {
      normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    } catch {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const workspaceAccessError = await verifyWorkspaceAccess({
      normalizedWsId,
      supabase,
      userId: user.id,
    });
    if (workspaceAccessError != null) {
      return workspaceAccessError;
    }

    const scopeError = await verifyLiveSessionScope({
      scope,
      supabase,
      userId: user.id,
    });
    if (scopeError != null) {
      return scopeError;
    }

    // Note: The 'live_api_sessions' table type will be available after running
    // migrations (bun sb:up) and regenerating types (bun sb:typegen)
    const { data, error } = await (
      supabase as Awaited<ReturnType<typeof createClient>>
    )
      .from('live_api_sessions' as never)
      .select('session_handle, expires_at')
      .eq('user_id', user.id)
      .eq('ws_id', normalizedWsId)
      .eq('scope_key', scopeKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) {
      serverLogger.error('[Session API] Error fetching session', error);
      return Response.json({ sessionHandle: null });
    }

    const sessionData = data as { session_handle?: string } | null;
    return Response.json({
      sessionHandle: sessionData?.session_handle || null,
    });
  } catch (error) {
    serverLogger.error('[Session API] Unexpected error in GET', error);
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
    const { sessionHandle, wsId, scopeKey } = body as {
      sessionHandle: string;
      wsId: string;
      scopeKey: string;
    };
    const scope = validateLiveSessionScopeKey(scopeKey);

    if (!sessionHandle || !wsId || !scopeKey) {
      return Response.json(
        { error: 'Missing required fields: sessionHandle, wsId, scopeKey' },
        { status: 400 }
      );
    }

    if (!isValidLiveSessionHandle(sessionHandle)) {
      return Response.json({ error: 'Invalid sessionHandle' }, { status: 400 });
    }

    if (!scope.valid) {
      return invalidScopeKeyResponse();
    }

    const supabase = await createClient(req);
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let normalizedWsId: string;
    try {
      normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    } catch {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const workspaceAccessError = await verifyWorkspaceAccess({
      normalizedWsId,
      supabase,
      userId: user.id,
    });
    if (workspaceAccessError != null) {
      return workspaceAccessError;
    }

    const scopeError = await verifyLiveSessionScope({
      scope,
      supabase,
      userId: user.id,
    });
    if (scopeError != null) {
      return scopeError;
    }

    // Session handles are valid for 2 hours per Gemini API docs
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    // Note: The 'live_api_sessions' table type will be available after running
    // migrations (bun sb:up) and regenerating types (bun sb:typegen)
    const { error } = await (
      supabase as Awaited<ReturnType<typeof createClient>>
    )
      .from('live_api_sessions' as never)
      .upsert(
        {
          user_id: user.id,
          ws_id: normalizedWsId,
          scope_key: scopeKey,
          session_handle: sessionHandle,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'user_id,ws_id,scope_key' }
      );

    if (error) {
      serverLogger.error('[Session API] Error storing session', error);
      return Response.json(
        { error: 'Failed to store session handle' },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    serverLogger.error('[Session API] Unexpected error in POST', error);
    return Response.json(
      { error: 'Failed to store session handle' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/live/session?wsId=...&scopeKey=...
 * Clear session handle (e.g., on explicit disconnect)
 */
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wsId = searchParams.get('wsId');
    const scopeKey = searchParams.get('scopeKey');
    const scope = validateLiveSessionScopeKey(scopeKey);

    if (!wsId || !scopeKey) {
      return Response.json(
        { error: 'Missing wsId or scopeKey parameter' },
        { status: 400 }
      );
    }

    if (!scope.valid) {
      return invalidScopeKeyResponse();
    }

    const supabase = await createClient(req);
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let normalizedWsId: string;
    try {
      normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    } catch {
      return Response.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const workspaceAccessError = await verifyWorkspaceAccess({
      normalizedWsId,
      supabase,
      userId: user.id,
    });
    if (workspaceAccessError != null) {
      return workspaceAccessError;
    }

    const scopeError = await verifyLiveSessionScope({
      scope,
      supabase,
      userId: user.id,
    });
    if (scopeError != null) {
      return scopeError;
    }

    // Note: The 'live_api_sessions' table type will be available after running
    // migrations (bun sb:up) and regenerating types (bun sb:typegen)
    const { error } = await (
      supabase as Awaited<ReturnType<typeof createClient>>
    )
      .from('live_api_sessions' as never)
      .delete()
      .eq('user_id', user.id)
      .eq('ws_id', normalizedWsId)
      .eq('scope_key', scopeKey);

    if (error) {
      serverLogger.error('[Session API] Error deleting session', error);
      return Response.json(
        { error: 'Failed to delete session handle' },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    serverLogger.error('[Session API] Unexpected error in DELETE', error);
    return Response.json(
      { error: 'Failed to delete session handle' },
      { status: 500 }
    );
  }
}
