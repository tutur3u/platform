import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const routeParamsSchema = z.object({
  sessionId: z.uuid(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; sessionId: string }> }
) {
  try {
    const { wsId: id, sessionId } = await params;
    const parsedResult = routeParamsSchema.safeParse({ sessionId });
    if (!parsedResult.success) {
      return NextResponse.json(
        { error: 'Invalid session ID format' },
        { status: 400 }
      );
    }
    const supabase = await createClient(request);

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(id, supabase);

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Source workspace access denied' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { targetWorkspaceId } = body;

    if (!targetWorkspaceId) {
      return NextResponse.json(
        { error: 'Target workspace ID is required' },
        { status: 400 }
      );
    }

    // Verify access to target workspace
    const { data: targetMemberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', targetWorkspaceId)
      .eq('user_id', user.id)
      .single();

    if (!targetMemberCheck) {
      return NextResponse.json(
        { error: 'Target workspace access denied' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();

    // Verify session exists and belongs to user
    const { data: session, error: sessionError } = await sbAdmin
      .from('time_tracking_sessions')
      .select(`
        *,
        category:time_tracking_categories(*),
        task:tasks(*)
      `)
      .eq('id', sessionId)
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Cannot move running sessions
    if (session.is_running) {
      return NextResponse.json(
        {
          error: 'Cannot move running sessions. Please stop the session first.',
        },
        { status: 400 }
      );
    }

    // Check if category exists in target workspace
    let targetCategoryId = null;
    if (session.category_id && session.category) {
      // Try to find the same category in target workspace
      const { data: targetCategory } = await sbAdmin
        .from('time_tracking_categories')
        .select('id')
        .eq('ws_id', targetWorkspaceId)
        .eq('name', session.category.name)
        .single();

      if (targetCategory) {
        targetCategoryId = targetCategory.id;
      }
      // If category doesn't exist in target workspace, it will be set to null
    }

    // Check if task exists in target workspace
    let targetTaskId = null;
    if (session.task_id && session.task) {
      // Try to find the same task in target workspace
      const { data: targetTask } = await sbAdmin
        .from('tasks')
        .select(
          'id, list:task_lists!inner(board:workspace_boards!inner(ws_id))'
        )
        .eq('list.board.ws_id', targetWorkspaceId)
        .eq('name', session.task.name)
        .single();

      if (targetTask) {
        targetTaskId = targetTask.id;
      }
      // If task doesn't exist in target workspace, it will be set to null
    }

    // Move the session by updating its workspace ID and clearing invalid references
    const { data: movedSession, error: moveError } = await sbAdmin
      .from('time_tracking_sessions')
      .update({
        ws_id: targetWorkspaceId,
        category_id: targetCategoryId,
        task_id: targetTaskId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select(
        `
        *,
        category:time_tracking_categories(*),
        task:tasks(*)
      `
      )
      .single();

    if (moveError) {
      console.error('Error moving session:', moveError);
      return NextResponse.json(
        { error: 'Failed to move session' },
        { status: 500 }
      );
    }

    // Get target workspace name for response
    const { data: targetWorkspace } = await sbAdmin
      .from('workspaces')
      .select('name')
      .eq('id', targetWorkspaceId)
      .single();

    return NextResponse.json({
      session: movedSession,
      targetWorkspaceName: targetWorkspace?.name,
      message: `Session moved to ${targetWorkspace?.name || 'target workspace'}`,
    });
  } catch (error) {
    console.error('Error in move session API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
