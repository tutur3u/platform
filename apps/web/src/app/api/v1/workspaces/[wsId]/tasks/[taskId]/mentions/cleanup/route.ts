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

function removeMentions(node: any, deletedTaskId: string): any {
  if (
    node?.type === 'mention' &&
    node?.attrs?.entityType === 'task' &&
    node?.attrs?.entityId === deletedTaskId
  ) {
    return null;
  }

  if (node?.content && Array.isArray(node.content)) {
    return {
      ...node,
      content: node.content
        .map((child: any) => removeMentions(child, deletedTaskId))
        .filter((child: any) => child !== null),
    };
  }

  return node;
}

function hasMention(node: any, deletedTaskId: string): boolean {
  if (
    node?.type === 'mention' &&
    node?.attrs?.entityType === 'task' &&
    node?.attrs?.entityId === deletedTaskId
  ) {
    return true;
  }

  if (node?.content && Array.isArray(node.content)) {
    return node.content.some((child: any) => hasMention(child, deletedTaskId));
  }

  return false;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const { wsId, taskId } = await params;
    const supabase = await createClient(request);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    const membership = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
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
        description,
        task_lists!inner(
          workspace_boards!inner(ws_id)
        )
      `
      )
      .eq('task_lists.workspace_boards.ws_id', normalizedWsId)
      .is('deleted_at', null);

    if (error) {
      return NextResponse.json(
        { message: 'Failed to load tasks for mention cleanup' },
        { status: 500 }
      );
    }

    const updates = (tasks || []).flatMap((task) => {
      if (!task.description) return [];

      try {
        const content =
          typeof task.description === 'string'
            ? JSON.parse(task.description)
            : task.description;

        if (!hasMention(content, taskId)) return [];

        return [
          {
            id: task.id,
            description: JSON.stringify(removeMentions(content, taskId)),
          },
        ];
      } catch {
        return [];
      }
    });

    await Promise.all(
      updates.map((task) =>
        sbAdmin
          .from('tasks')
          .update({ description: task.description })
          .eq('id', task.id)
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected mention cleanup error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
