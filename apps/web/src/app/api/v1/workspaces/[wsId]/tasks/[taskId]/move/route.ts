import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  taskId: z.uuid(),
});

const moveTaskSchema = z.object({
  list_id: z.uuid(),
  target_board_id: z.uuid().optional(),
});

type TaskMoveRow = {
  id: string;
  display_number: number | null;
  name: string;
  description: string | null;
  priority: Database['public']['Enums']['task_priority'] | null;
  completed: boolean | null;
  completed_at: string | null;
  start_date: string | null;
  end_date: string | null;
  estimation_points: number | null;
  created_at: string;
  sort_key: number | null;
  closed_at: string | null;
  deleted_at: string | null;
  list_id: string;
  task_lists: {
    id: string;
    name: string;
    status: string | null;
    board_id: string;
    workspace_boards: {
      id: string;
      name: string;
      ws_id: string;
    } | null;
  } | null;
  assignees: Array<{
    id: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null> | null;
  labels: Array<{
    id: string | null;
    name: string | null;
    color: string | null;
    created_at: string | null;
  } | null> | null;
  projects: Array<{
    id: string | null;
    name: string | null;
    status: string | null;
  } | null> | null;
};

async function requireWorkspaceTaskAccess(
  request: Request,
  rawParams: unknown
) {
  const { wsId: rawWsId, taskId } = paramsSchema.parse(rawParams);
  const supabase = await createClient(request);

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const memberCheck = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
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

  return { supabase, wsId, taskId };
}

function normalizeTask(task: TaskMoveRow) {
  return {
    id: task.id,
    display_number: task.display_number,
    name: task.name,
    description: task.description,
    priority: task.priority,
    completed: task.completed ?? false,
    completed_at: task.completed_at,
    start_date: task.start_date,
    end_date: task.end_date,
    estimation_points: task.estimation_points,
    created_at: task.created_at,
    sort_key: task.sort_key,
    closed_at: task.closed_at,
    deleted_at: task.deleted_at,
    list_id: task.list_id,
    board_id: task.task_lists?.board_id ?? null,
    board_name: task.task_lists?.workspace_boards?.name ?? null,
    list_name: task.task_lists?.name ?? null,
    list_status: task.task_lists?.status ?? null,
    assignees: (task.assignees ?? []).flatMap((assignee) => {
      if (!assignee?.id) return [];
      return [
        {
          id: assignee.id,
          display_name: assignee.display_name,
          avatar_url: assignee.avatar_url,
        },
      ];
    }),
    labels: (task.labels ?? []).flatMap((label) => {
      if (!label?.id || !label.name || !label.color || !label.created_at) {
        return [];
      }

      return [
        {
          id: label.id,
          name: label.name,
          color: label.color,
          created_at: label.created_at,
        },
      ];
    }),
    projects: (task.projects ?? []).flatMap((project) => {
      if (!project?.id || !project.name) return [];
      return [
        {
          id: project.id,
          name: project.name,
          status: project.status,
        },
      ];
    }),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const access = await requireWorkspaceTaskAccess(request, await params);
    if ('error' in access) return access.error;

    const { wsId, taskId } = access;
    const body = moveTaskSchema.parse(await request.json());
    const sbAdmin = await createAdminClient();

    const { data: currentTask, error: taskError } = await sbAdmin
      .from('tasks')
      .select(
        `
        id,
        list_id,
        completed,
        completed_at,
        closed_at,
        task_lists!inner(
          status,
          board_id,
          workspace_boards!inner(ws_id)
        )
      `
      )
      .eq('id', taskId)
      .maybeSingle();

    if (taskError) {
      return NextResponse.json(
        { error: 'Failed to load task' },
        { status: 500 }
      );
    }

    if (
      !currentTask ||
      currentTask.task_lists?.workspace_boards?.ws_id !== wsId
    ) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { data: targetList, error: targetListError } = await sbAdmin
      .from('task_lists')
      .select(
        `
        id,
        board_id,
        status,
        deleted,
        workspace_boards!inner(ws_id)
      `
      )
      .eq('id', body.list_id)
      .maybeSingle();

    if (targetListError) {
      return NextResponse.json(
        { error: 'Failed to load target list' },
        { status: 500 }
      );
    }

    if (!targetList || targetList.workspace_boards?.ws_id !== wsId) {
      return NextResponse.json(
        { error: 'Target list not found' },
        { status: 404 }
      );
    }

    if (targetList.deleted) {
      return NextResponse.json(
        { error: 'Target list is archived' },
        { status: 400 }
      );
    }

    const sourceBoardId = currentTask.task_lists.board_id;
    const targetBoardId = targetList.board_id;
    const movedToDifferentBoard = targetBoardId !== sourceBoardId;
    const sourceListStatus = currentTask.task_lists.status;
    const targetListStatus = targetList.status;
    const currentlyArchived = !!currentTask.closed_at;
    const isSourceCompletionList =
      sourceListStatus === 'done' || sourceListStatus === 'closed';
    const isTargetCompletionList =
      targetListStatus === 'done' || targetListStatus === 'closed';
    const completionTimestamp = new Date().toISOString();

    let closedAt: string | null;
    if (isTargetCompletionList) {
      closedAt = completionTimestamp;
    } else if (isSourceCompletionList) {
      closedAt = null;
    } else {
      closedAt = currentlyArchived ? currentTask.closed_at : null;
    }

    let completed: boolean | null;
    let completedAt: string | null;

    if (isTargetCompletionList) {
      completed = true;
      completedAt = completionTimestamp;
    } else if (isSourceCompletionList) {
      completed = false;
      completedAt = null;
    } else {
      completed = currentTask.completed;
      completedAt = currentTask.completed_at;
    }

    const updatePayload: Database['public']['Tables']['tasks']['Update'] = {
      list_id: body.list_id,
      closed_at: closedAt,
      completed,
      completed_at: completedAt,
    };

    if (movedToDifferentBoard) {
      updatePayload.display_number = null;
    }

    const { data: updatedTask, error: updateError } = await sbAdmin
      .from('tasks')
      .update(updatePayload)
      .eq('id', taskId)
      .select('id, list_id')
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to move task' },
        { status: 500 }
      );
    }

    if (!updatedTask || updatedTask.list_id !== body.list_id) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { data: reloadedTask, error: updatedTaskError } = await sbAdmin
      .from('tasks')
      .select(
        `
        id,
        display_number,
        name,
        description,
        priority,
        completed,
        completed_at,
        start_date,
        end_date,
        estimation_points,
        created_at,
        sort_key,
        closed_at,
        deleted_at,
        list_id,
        task_lists!inner(
          id,
          name,
          status,
          board_id,
          workspace_boards!inner(
            id,
            name,
            ws_id
          )
        ),
        assignees:task_assignees(
          users(id, display_name, avatar_url)
        ),
        labels:task_labels(
          workspace_task_labels(id, name, color, created_at)
        ),
        projects:task_project_tasks(
          task_projects(id, name, status)
        )
      `
      )
      .eq('id', taskId)
      .maybeSingle();

    if (updatedTaskError) {
      return NextResponse.json(
        { error: 'Failed to load moved task' },
        { status: 500 }
      );
    }

    if (!reloadedTask) {
      return NextResponse.json(
        { error: 'Task not found after move' },
        { status: 404 }
      );
    }

    const rawTask = reloadedTask as unknown as {
      assignees?: Array<{
        users?: TaskMoveRow['assignees'] extends Array<infer U> ? U : never;
      }>;
      labels?: Array<{
        workspace_task_labels?: TaskMoveRow['labels'] extends Array<infer U>
          ? U
          : never;
      }>;
      projects?: Array<{
        task_projects?: TaskMoveRow['projects'] extends Array<infer U>
          ? U
          : never;
      }>;
    } & Omit<TaskMoveRow, 'assignees' | 'labels' | 'projects'>;

    const normalizedTask = normalizeTask({
      ...rawTask,
      assignees: (rawTask.assignees ?? []).map((entry) => entry.users ?? null),
      labels: (rawTask.labels ?? []).map(
        (entry) => entry.workspace_task_labels ?? null
      ),
      projects: (rawTask.projects ?? []).map(
        (entry) => entry.task_projects ?? null
      ),
    } as TaskMoveRow);

    return NextResponse.json({
      task: normalizedTask,
      movedToDifferentBoard,
      sourceBoardId,
      targetBoardId,
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request data' },
        { status: 400 }
      );
    }

    console.error('Error moving task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
