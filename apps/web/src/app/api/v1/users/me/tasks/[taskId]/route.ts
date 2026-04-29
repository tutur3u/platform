import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { WorkspaceProductTier } from '@tuturuuu/types';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';

type TaskAssigneeJoinRow = {
  user_id: string;
  users?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

type TaskLabelJoinRow = {
  label_id: string;
  workspace_task_labels?: {
    id: string;
    name: string;
    color: string | null;
    created_at: string | null;
  } | null;
};

type TaskProjectJoinRow = {
  project_id: string;
  task_projects?: {
    id: string;
    name: string;
    status: string | null;
  } | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;

    if (!validate(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: task, error: taskError } = await sbAdmin
      .from('tasks')
      .select(
        `
        *,
        list:task_lists!inner(
          id,
          name,
          board_id,
          board:workspace_boards(
            id,
            ws_id,
            workspace:workspaces(personal, tier)
          )
        ),
        assignees:task_assignees(
          user_id,
          users(id, display_name, avatar_url)
        ),
        labels:task_labels(
          label_id,
          workspace_task_labels(id, name, color, created_at)
        ),
        projects:task_project_tasks(
          project_id,
          task_projects(id, name, status)
        )
      `
      )
      .eq('id', taskId)
      .maybeSingle();

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const taskAny = task as any;
    const taskWsId = taskAny.list?.board?.ws_id as string | undefined;
    if (!taskWsId) {
      return NextResponse.json(
        { error: 'Task workspace not found' },
        { status: 404 }
      );
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId: taskWsId,
      userId: user.id,
      supabase: supabase,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify task access' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const boardId = taskAny.list?.board_id as string | undefined;
    if (!boardId) {
      return NextResponse.json(
        { error: 'Task board not found' },
        { status: 404 }
      );
    }

    const { data: availableLists, error: listsError } = await sbAdmin
      .from('task_lists')
      .select('*')
      .eq('board_id', boardId)
      .eq('deleted', false)
      .order('position')
      .order('created_at');

    if (listsError) {
      return NextResponse.json(
        { error: 'Failed to load task lists' },
        { status: 500 }
      );
    }

    const transformedTask = {
      ...task,
      assignees: taskAny.assignees?.map((assignee: TaskAssigneeJoinRow) => ({
        id: assignee.users?.id || assignee.user_id,
        user_id: assignee.user_id,
        display_name: assignee.users?.display_name,
        avatar_url: assignee.users?.avatar_url,
      })),
      labels: taskAny.labels
        ?.map((label: TaskLabelJoinRow) => label.workspace_task_labels)
        .filter(Boolean),
      projects: taskAny.projects
        ?.map((project: TaskProjectJoinRow) => project.task_projects)
        .filter(Boolean),
    };

    return NextResponse.json({
      task: transformedTask,
      availableLists: (availableLists || []) as TaskList[],
      taskWsId,
      taskWorkspacePersonal: taskAny.list?.board?.workspace?.personal ?? false,
      taskWorkspaceTier:
        (taskAny.list?.board?.workspace?.tier as WorkspaceProductTier | null) ??
        'FREE',
    });
  } catch (error) {
    console.error('Error fetching current user task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
