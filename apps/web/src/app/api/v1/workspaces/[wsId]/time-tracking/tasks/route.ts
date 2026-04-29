import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient(request);
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { message: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const sbAdmin = await createAdminClient();
    const { data: tasks, error } = await sbAdmin
      .from('tasks')
      .select(
        `
        id,
        name,
        description,
        priority,
        start_date,
        end_date,
        created_at,
        list:task_lists!inner(
          id,
          name,
          status,
          deleted,
          board:workspace_boards!inner(
            id,
            name,
            ws_id,
            ticket_prefix
          )
        ),
        assignees:task_assignees(
          user:users(
            id,
            display_name,
            avatar_url,
            user_private_details(email)
          )
        )
      `
      )
      .eq('list.board.ws_id', normalizedWsId)
      .is('deleted_at', null)
      .is('closed_at', null)
      .in('list.status', ['not_started', 'active'])
      .eq('list.deleted', false)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Failed to load time tracking tasks:', error);
      return NextResponse.json(
        { message: 'Failed to load tasks' },
        { status: 500 }
      );
    }

    const formattedTasks = (tasks || []).map((task) => {
      const list = Array.isArray(task.list) ? task.list[0] : task.list;
      const board = list?.board
        ? Array.isArray(list.board)
          ? list.board[0]
          : list.board
        : null;

      return {
        ...task,
        board_name: board?.name ?? null,
        list_name: list?.name ?? null,
        ticket_prefix: board?.ticket_prefix ?? null,
      };
    });

    return NextResponse.json({ tasks: formattedTasks });
  } catch (error) {
    console.error('Unexpected time tracking tasks error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
