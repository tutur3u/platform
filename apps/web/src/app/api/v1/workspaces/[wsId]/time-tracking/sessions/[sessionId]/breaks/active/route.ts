import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

export async function GET(
  req: Request,
  context: { params: Promise<{ wsId: string; sessionId: string }> }
) {
  const { wsId, sessionId } = await context.params;
  const sessionIdValidation = z.guid().safeParse(sessionId);
  if (!sessionIdValidation.success) {
    return NextResponse.json(
      { error: 'Invalid session ID format' },
      { status: 400 }
    );
  }

  const normalizedWsId = await normalizeWorkspaceId(wsId);
  const supabase = await createClient(req);

  // Get current user
  const { user, authError: userError } =
    await resolveAuthenticatedSessionUser(supabase);

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const memberCheck = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId: user.id,
    supabase: supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!memberCheck.ok) {
    return NextResponse.json(
      { error: 'Workspace access denied' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();

  try {
    // Verify session belongs to user's workspace
    const { data: session, error: sessionError } = await sbAdmin
      .from('time_tracking_sessions')
      .select('id, ws_id, user_id')
      .eq('id', sessionId)
      .eq('ws_id', normalizedWsId)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Fetch active break (where break_end is null)
    const { data: activeBreak, error: breakError } = await sbAdmin
      .from('time_tracking_breaks')
      .select(
        `
        id,
        session_id,
        break_type_id,
        break_type_name,
        break_start,
        break_end,
        break_duration_seconds,
        workspace_break_types:break_type_id (
          id,
          name,
          icon,
          color
        )
      `
      )
      .eq('session_id', sessionId)
      .is('break_end', null)
      .order('break_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (breakError) {
      console.error('Error fetching active break:', breakError);
      return NextResponse.json(
        { error: 'Failed to fetch active break' },
        { status: 500 }
      );
    }

    // Transform response to flatten break_type
    const transformedBreak = activeBreak
      ? (() => {
          const { workspace_break_types, ...rest } = activeBreak;
          return {
            ...rest,
            break_type: Array.isArray(workspace_break_types)
              ? workspace_break_types[0]
              : workspace_break_types,
          };
        })()
      : null;

    return NextResponse.json({ break: transformedBreak });
  } catch (error) {
    console.error('Error in active break endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
