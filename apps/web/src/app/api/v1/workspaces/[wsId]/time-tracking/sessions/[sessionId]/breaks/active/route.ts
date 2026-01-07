import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

export async function GET(
  _req: Request,
  context: { params: Promise<{ wsId: string; sessionId: string }> }
) {
  const { wsId, sessionId } = await context.params;
  const normalizedWsId = await normalizeWorkspaceId(wsId);
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Verify session belongs to user's workspace
    const { data: session, error: sessionError } = await supabase
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
    const { data: activeBreak, error: breakError } = await supabase
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
