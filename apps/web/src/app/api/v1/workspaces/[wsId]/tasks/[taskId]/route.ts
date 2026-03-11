import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types';
import {
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  taskId: z.uuid(),
});

const updateTaskSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_TASK_NAME_LENGTH).optional(),
    description: z
      .string()
      .max(MAX_TASK_DESCRIPTION_LENGTH)
      .nullable()
      .optional(),
    priority: z
      .enum(['low', 'normal', 'high', 'critical'])
      .nullable()
      .optional(),
    start_date: z.string().datetime().nullable().optional(),
    end_date: z.string().datetime().nullable().optional(),
    completed: z.boolean().optional(),
    list_id: z.uuid().optional(),
    deleted: z.boolean().optional(),
    estimation_points: z.number().int().min(0).max(8).nullable().optional(),
    label_ids: z.array(z.uuid()).optional(),
    project_ids: z.array(z.uuid()).optional(),
    assignee_ids: z.array(z.uuid()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one task field is required',
  });

type TaskPriority = Database['public']['Enums']['task_priority'];
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
type TaskRecord = {
  id: string;
  name: string;
  description: string | null;
  priority: TaskPriority | null;
  completed: boolean | null;
  start_date: string | null;
  end_date: string | null;
  estimation_points: number | null;
  created_at: string | null;
  closed_at: string | null;
  deleted_at: string | null;
  list_id: string | null;
  task_lists: {
    id: string;
    name: string | null;
    status: string | null;
    board_id: string;
    workspace_boards: {
      id: string;
      ws_id: string;
      name: string | null;
    } | null;
  } | null;
  assignees: Array<{
    user: {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  }> | null;
  labels: Array<{
    label: {
      id: string;
      name: string | null;
      color: string | null;
    } | null;
  }> | null;
  projects: Array<{
    project: {
      id: string;
      name: string | null;
    } | null;
  }> | null;
};

async function requireWorkspaceAccess(
  request: NextRequest,
  rawParams: unknown
) {
  const { wsId: rawWsId, taskId } = paramsSchema.parse(rawParams);
  const supabase = await createClient(request);
  const wsId = await normalizeWorkspaceId(rawWsId, supabase);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: memberCheck, error: memberError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberError) {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!memberCheck) {
    return {
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  return { supabase, wsId, taskId };
}

async function getWorkspaceTask(
  supabase: TypedSupabaseClient,
  wsId: string,
  taskId: string
): Promise<{ error: Error | null; task: TaskRecord | null }> {
  const { data: task, error } = await supabase
    .from('tasks')
    .select(
      `
      id,
      name,
      description,
      priority,
      completed,
      start_date,
      end_date,
      estimation_points,
      created_at,
      closed_at,
      deleted_at,
      list_id,
      task_lists!inner (
        id,
        name,
        status,
        board_id,
        workspace_boards!inner (
          id,
          ws_id,
          name
        )
      ),
      assignees:task_assignees(
        user:users(
          id,
          display_name,
          avatar_url
        )
      ),
      labels:task_labels(
        label:workspace_task_labels(
          id,
          name,
          color
        )
      ),
      projects:task_project_tasks(
        project:task_projects(
          id,
          name
        )
      )
    `
    )
    .eq('id', taskId)
    .maybeSingle();

  if (error) {
    return { error, task: null };
  }

  if (!task || task.task_lists?.workspace_boards?.ws_id !== wsId) {
    return { error: null, task: null };
  }

  return { error: null, task: task as TaskRecord };
}

function serializeTask(task: TaskRecord) {
  const assignees = Array.isArray(task.assignees)
    ? task.assignees
        .map((entry) => entry.user)
        .filter(
          (
            user
          ): user is {
            id: string;
            display_name: string | null;
            avatar_url: string | null;
          } => user !== null
        )
    : [];

  return {
    id: task.id,
    name: task.name,
    description: task.description,
    priority: task.priority,
    completed: task.completed,
    start_date: task.start_date,
    end_date: task.end_date,
    estimation_points: task.estimation_points,
    created_at: task.created_at,
    closed_at: task.closed_at,
    deleted_at: task.deleted_at,
    list_id: task.list_id,
    board_id: task.task_lists?.board_id ?? null,
    board_name: task.task_lists?.workspace_boards?.name ?? null,
    list_name: task.task_lists?.name ?? null,
    list_status: task.task_lists?.status ?? null,
    assignees,
    labels: Array.isArray(task.labels)
      ? task.labels
          .map((entry) => entry.label)
          .filter(
            (
              label
            ): label is {
              id: string;
              name: string | null;
              color: string | null;
            } => label !== null
          )
      : [],
    projects: Array.isArray(task.projects)
      ? task.projects
          .map((entry) => entry.project)
          .filter(
            (
              project
            ): project is {
              id: string;
              name: string | null;
            } => project !== null
          )
      : [],
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const access = await requireWorkspaceAccess(request, await params);
    if ('error' in access) return access.error;

    const { supabase, wsId, taskId } = access;
    const { task, error } = await getWorkspaceTask(supabase, wsId, taskId);

    if (error) {
      console.error('Error loading task:', error);
      return NextResponse.json(
        { error: 'Failed to load task' },
        { status: 500 }
      );
    }

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task: serializeTask(task) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    console.error('Error fetching task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const access = await requireWorkspaceAccess(request, await params);
    if ('error' in access) return access.error;

    const { supabase, wsId, taskId } = access;
    const body = updateTaskSchema.parse(await request.json());
    const { task, error } = await getWorkspaceTask(supabase, wsId, taskId);

    if (error) {
      console.error('Error loading task before update:', error);
      return NextResponse.json(
        { error: 'Failed to load task' },
        { status: 500 }
      );
    }

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (body.list_id) {
      const { data: listCheck, error: listError } = await supabase
        .from('task_lists')
        .select('id, workspace_boards!inner(ws_id)')
        .eq('id', body.list_id)
        .eq('workspace_boards.ws_id', wsId)
        .maybeSingle();

      if (listError) {
        console.error('Error validating target list:', listError);
        return NextResponse.json(
          { error: 'Failed to validate task list' },
          { status: 500 }
        );
      }

      if (!listCheck) {
        return NextResponse.json(
          { error: 'Task list not found' },
          { status: 404 }
        );
      }
    }

    const updatePayload: TaskUpdate = {
      ...(body.name != null ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined
        ? { description: body.description?.trim() || null }
        : {}),
      ...(body.priority !== undefined
        ? { priority: body.priority as TaskPriority | null }
        : {}),
      ...(body.start_date !== undefined ? { start_date: body.start_date } : {}),
      ...(body.end_date !== undefined ? { end_date: body.end_date } : {}),
      ...(body.estimation_points !== undefined
        ? { estimation_points: body.estimation_points }
        : {}),
      ...(body.completed !== undefined ? { completed: body.completed } : {}),
      ...(body.list_id !== undefined ? { list_id: body.list_id } : {}),
      ...(body.deleted !== undefined
        ? { deleted_at: body.deleted ? new Date().toISOString() : null }
        : {}),
    };

    const { error: updateError } = await supabase
      .from('tasks')
      .update(updatePayload)
      .eq('id', taskId);

    if (updateError) {
      console.error('Error updating task:', updateError);
      return NextResponse.json(
        { error: 'Failed to update task' },
        { status: 500 }
      );
    }

    if (body.assignee_ids !== undefined) {
      const normalizedAssigneeIds = [...new Set(body.assignee_ids)];

      if (normalizedAssigneeIds.length > 0) {
        const { data: members, error: membersError } = await supabase
          .from('workspace_members')
          .select('user_id')
          .eq('ws_id', wsId)
          .in('user_id', normalizedAssigneeIds);

        if (membersError) {
          console.error('Error validating assignees:', membersError);
          return NextResponse.json(
            { error: 'Failed to validate task assignees' },
            { status: 500 }
          );
        }

        const validAssigneeIds = new Set(
          (members ?? []).map((member) => member.user_id)
        );
        const hasInvalidAssignee = normalizedAssigneeIds.some(
          (assigneeId) => !validAssigneeIds.has(assigneeId)
        );

        if (hasInvalidAssignee) {
          return NextResponse.json(
            { error: 'One or more assignees are not in this workspace' },
            { status: 400 }
          );
        }
      }

      const { error: clearAssigneesError } = await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', taskId);

      if (clearAssigneesError) {
        console.error('Error clearing task assignees:', clearAssigneesError);
        return NextResponse.json(
          { error: 'Failed to update task assignees' },
          { status: 500 }
        );
      }

      if (normalizedAssigneeIds.length > 0) {
        const { error: addAssigneesError } = await supabase
          .from('task_assignees')
          .insert(
            normalizedAssigneeIds.map((assigneeId) => ({
              task_id: taskId,
              user_id: assigneeId,
            }))
          );

        if (addAssigneesError) {
          console.error('Error adding task assignees:', addAssigneesError);
          return NextResponse.json(
            { error: 'Failed to update task assignees' },
            { status: 500 }
          );
        }
      }
    }

    if (body.label_ids !== undefined) {
      const normalizedLabelIds = [...new Set(body.label_ids)];

      if (normalizedLabelIds.length > 0) {
        const { data: labels, error: labelsError } = await supabase
          .from('workspace_task_labels')
          .select('id')
          .eq('ws_id', wsId)
          .in('id', normalizedLabelIds);

        if (labelsError) {
          console.error('Error validating labels:', labelsError);
          return NextResponse.json(
            { error: 'Failed to validate task labels' },
            { status: 500 }
          );
        }

        const validLabelIds = new Set((labels ?? []).map((label) => label.id));
        const hasInvalidLabel = normalizedLabelIds.some(
          (labelId) => !validLabelIds.has(labelId)
        );

        if (hasInvalidLabel) {
          return NextResponse.json(
            { error: 'One or more labels do not belong to this workspace' },
            { status: 400 }
          );
        }
      }

      const { error: clearLabelsError } = await supabase
        .from('task_labels')
        .delete()
        .eq('task_id', taskId);

      if (clearLabelsError) {
        console.error('Error clearing task labels:', clearLabelsError);
        return NextResponse.json(
          { error: 'Failed to update task labels' },
          { status: 500 }
        );
      }

      if (normalizedLabelIds.length > 0) {
        const { error: addLabelsError } = await supabase
          .from('task_labels')
          .insert(
            normalizedLabelIds.map((labelId) => ({
              task_id: taskId,
              label_id: labelId,
            }))
          );

        if (addLabelsError) {
          console.error('Error adding task labels:', addLabelsError);
          return NextResponse.json(
            { error: 'Failed to update task labels' },
            { status: 500 }
          );
        }
      }
    }

    if (body.project_ids !== undefined) {
      const normalizedProjectIds = [...new Set(body.project_ids)];

      if (normalizedProjectIds.length > 0) {
        const { data: projects, error: projectsError } = await supabase
          .from('task_projects')
          .select('id')
          .eq('ws_id', wsId)
          .in('id', normalizedProjectIds);

        if (projectsError) {
          console.error('Error validating projects:', projectsError);
          return NextResponse.json(
            { error: 'Failed to validate task projects' },
            { status: 500 }
          );
        }

        const validProjectIds = new Set(
          (projects ?? []).map((project) => project.id)
        );
        const hasInvalidProject = normalizedProjectIds.some(
          (projectId) => !validProjectIds.has(projectId)
        );

        if (hasInvalidProject) {
          return NextResponse.json(
            { error: 'One or more projects do not belong to this workspace' },
            { status: 400 }
          );
        }
      }

      const { error: clearProjectsError } = await supabase
        .from('task_project_tasks')
        .delete()
        .eq('task_id', taskId);

      if (clearProjectsError) {
        console.error('Error clearing task projects:', clearProjectsError);
        return NextResponse.json(
          { error: 'Failed to update task projects' },
          { status: 500 }
        );
      }

      if (normalizedProjectIds.length > 0) {
        const { error: addProjectsError } = await supabase
          .from('task_project_tasks')
          .insert(
            normalizedProjectIds.map((projectId) => ({
              task_id: taskId,
              project_id: projectId,
            }))
          );

        if (addProjectsError) {
          console.error('Error adding task projects:', addProjectsError);
          return NextResponse.json(
            { error: 'Failed to update task projects' },
            { status: 500 }
          );
        }
      }
    }

    const updatedTaskResult = await getWorkspaceTask(supabase, wsId, taskId);

    if (updatedTaskResult.error) {
      console.error('Error reloading updated task:', updatedTaskResult.error);
      return NextResponse.json(
        { error: 'Failed to load updated task' },
        { status: 500 }
      );
    }

    if (!updatedTaskResult.task) {
      return NextResponse.json(
        { error: 'Task not found after update' },
        { status: 404 }
      );
    }

    return NextResponse.json({ task: serializeTask(updatedTaskResult.task) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const access = await requireWorkspaceAccess(request, await params);
    if ('error' in access) return access.error;

    const { supabase, wsId, taskId } = access;
    const { task, error } = await getWorkspaceTask(supabase, wsId, taskId);

    if (error) {
      console.error('Error loading task before delete:', error);
      return NextResponse.json(
        { error: 'Failed to load task' },
        { status: 500 }
      );
    }

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!task.deleted_at) {
      return NextResponse.json(
        {
          error:
            'Task must be moved to trash first. Please move the task to trash before permanently deleting it.',
        },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (deleteError) {
      console.error('Supabase error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to permanently delete task' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Task permanently deleted',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    console.error('Error permanently deleting task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const access = await requireWorkspaceAccess(request, await params);
    if ('error' in access) return access.error;

    const { supabase, wsId, taskId } = access;
    const body = await request.json();

    if (body.restore !== true) {
      return NextResponse.json(
        { error: 'Invalid request. Use restore: true to restore a task' },
        { status: 400 }
      );
    }

    const { task, error } = await getWorkspaceTask(supabase, wsId, taskId);

    if (error) {
      console.error('Error loading task before restore:', error);
      return NextResponse.json(
        { error: 'Failed to load task' },
        { status: 500 }
      );
    }

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!task.deleted_at) {
      return NextResponse.json(
        { error: 'Task is not in trash' },
        { status: 400 }
      );
    }

    const { error: restoreError } = await supabase
      .from('tasks')
      .update({ deleted_at: null })
      .eq('id', taskId);

    if (restoreError) {
      console.error('Supabase error:', restoreError);
      return NextResponse.json(
        { error: 'Failed to restore task' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Task restored successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid workspace or task ID' },
        { status: 400 }
      );
    }

    console.error('Error restoring task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
