import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TaskActorRpcArgs } from '@tuturuuu/types/db';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { deriveTaskDescriptionYjsState } from '@tuturuuu/utils/yjs-task-description';
import { type NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import {
  paramsSchema,
  restoreTaskSchema,
  type TaskPriority,
  type TaskRecord,
  updateTaskSchema,
} from './schema';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

async function requireWorkspaceAccess(
  request: NextRequest,
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

  return { supabase, user, wsId, taskId };
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
      display_number,
      name,
      description,
      priority,
      completed,
      completed_at,
      start_date,
      end_date,
      estimation_points,
      sort_key,
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
        ...users(
          id,
          display_name,
          avatar_url
        )
      ),
      labels:task_labels(
        ...workspace_task_labels(
          id,
          name,
          color,
          created_at
        )
      ),
      projects:task_project_tasks(
        ...task_projects(
          id,
          name,
          status
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
  const assigneeIds = Array.isArray(task.assignees)
    ? task.assignees
        .map((entry) => entry?.id)
        .filter((id): id is string => !!id)
    : [];

  const labelIds = Array.isArray(task.labels)
    ? task.labels.map((entry) => entry?.id).filter((id): id is string => !!id)
    : [];

  const projectIds = Array.isArray(task.projects)
    ? task.projects.map((entry) => entry?.id).filter((id): id is string => !!id)
    : [];

  const uniqueAssigneeIds = [...new Set(assigneeIds)];
  const uniqueLabelIds = [...new Set(labelIds)];
  const uniqueProjectIds = [...new Set(projectIds)];

  return {
    id: task.id,
    display_number: task.display_number,
    name: task.name,
    description: task.description,
    priority: task.priority,
    completed: task.completed,
    completed_at: task.completed_at,
    start_date: task.start_date,
    end_date: task.end_date,
    estimation_points: task.estimation_points,
    sort_key: task.sort_key,
    created_at: task.created_at,
    closed_at: task.closed_at,
    deleted_at: task.deleted_at,
    list_id: task.list_id,
    board_id: task.task_lists?.board_id ?? null,
    board_name: task.task_lists?.workspace_boards?.name ?? null,
    list_name: task.task_lists?.name ?? null,
    list_status: task.task_lists?.status ?? null,
    assignees: task.assignees ?? [],
    labels: task.labels ?? [],
    projects: task.projects ?? [],
    assignee_ids: uniqueAssigneeIds,
    label_ids: uniqueLabelIds,
    project_ids: uniqueProjectIds,
  };
}

type LinkedCalendarEvent = {
  id: string;
  start_at: string;
  end_at: string;
  ws_id?: string | null;
};

function floorToQuarterHour(date: Date) {
  return new Date(
    Math.floor(date.getTime() / FIFTEEN_MINUTES_MS) * FIFTEEN_MINUTES_MS
  );
}

async function getLinkedTaskCalendarEvents(sbAdmin: any, taskId: string) {
  const [{ data: directEvents }, { data: legacyLinks }] = await Promise.all([
    sbAdmin
      .from('workspace_calendar_events')
      .select('id, start_at, end_at, ws_id')
      .eq('task_id', taskId),
    sbAdmin
      .from('task_calendar_events')
      .select(
        `
        event_id,
        workspace_calendar_events (
          id,
          start_at,
          end_at,
          ws_id
        )
      `
      )
      .eq('task_id', taskId),
  ]);

  const eventsById = new Map<string, LinkedCalendarEvent>();

  for (const event of (directEvents as LinkedCalendarEvent[] | null) ?? []) {
    if (!event?.id) continue;
    eventsById.set(event.id, event);
  }

  for (const link of (legacyLinks as Array<{
    workspace_calendar_events?: LinkedCalendarEvent | null;
  }> | null) ?? []) {
    const event = link.workspace_calendar_events;
    if (!event?.id) continue;
    eventsById.set(event.id, event);
  }

  return [...eventsById.values()];
}

async function deleteCalendarEventsByIds(sbAdmin: any, eventIds: string[]) {
  if (eventIds.length === 0) {
    return;
  }

  await sbAdmin.from('task_calendar_events').delete().in('event_id', eventIds);
  await sbAdmin
    .from('workspace_calendar_events')
    .delete()
    .in('id', [...new Set(eventIds)]);
}

async function removeAllLinkedTaskCalendarEvents(sbAdmin: any, taskId: string) {
  const linkedEvents = await getLinkedTaskCalendarEvents(sbAdmin, taskId);
  const eventIds = linkedEvents.map((event) => event.id);

  await deleteCalendarEventsByIds(sbAdmin, eventIds);
  await sbAdmin.from('task_calendar_events').delete().eq('task_id', taskId);
}

async function removeTaskSchedulingSettings(sbAdmin: any, taskId: string) {
  await sbAdmin
    .from('task_user_scheduling_settings')
    .delete()
    .eq('task_id', taskId);
}

async function clampTaskScheduleToCompletedWork(sbAdmin: any, taskId: string) {
  const now = new Date();
  const roundedNow = floorToQuarterHour(now);
  const linkedEvents = await getLinkedTaskCalendarEvents(sbAdmin, taskId);
  const eventIdsToDelete: string[] = [];
  let completedMinutes = 0;

  for (const event of linkedEvents) {
    const startAt = new Date(event.start_at);
    const endAt = new Date(event.end_at);

    if (endAt <= roundedNow) {
      completedMinutes += Math.max(
        0,
        Math.round((endAt.getTime() - startAt.getTime()) / 60000)
      );
      continue;
    }

    if (startAt >= roundedNow) {
      eventIdsToDelete.push(event.id);
      continue;
    }

    if (roundedNow <= startAt) {
      eventIdsToDelete.push(event.id);
      continue;
    }

    completedMinutes += Math.max(
      0,
      Math.round((roundedNow.getTime() - startAt.getTime()) / 60000)
    );

    if (roundedNow.getTime() <= startAt.getTime()) {
      eventIdsToDelete.push(event.id);
      continue;
    }

    await sbAdmin
      .from('workspace_calendar_events')
      .update({ end_at: roundedNow.toISOString(), locked: true })
      .eq('id', event.id);
  }

  await deleteCalendarEventsByIds(sbAdmin, eventIdsToDelete);

  await sbAdmin
    .from('task_user_scheduling_settings')
    .update({
      total_duration: completedMinutes / 60,
      auto_schedule: false,
    })
    .eq('task_id', taskId);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string; taskId: string }> }
) {
  try {
    const access = await requireWorkspaceAccess(request, await params);
    if ('error' in access) return access.error;

    const { wsId, taskId } = access;
    const sbAdmin = await createAdminClient();
    const { task, error } = await getWorkspaceTask(sbAdmin, wsId, taskId);

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
    if (error instanceof ZodError) {
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

    const { supabase, user, wsId, taskId } = access;
    const sbAdmin = await createAdminClient();
    const body = updateTaskSchema.parse(await request.json());
    const { task, error } = await getWorkspaceTask(sbAdmin, wsId, taskId);

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

    let normalizedAssigneeIds = body.assignee_ids
      ? [...new Set(body.assignee_ids)]
      : undefined;
    const normalizedLabelIds = body.label_ids
      ? [...new Set(body.label_ids)]
      : undefined;
    const normalizedProjectIds = body.project_ids
      ? [...new Set(body.project_ids)]
      : undefined;

    let targetListStatus: string | null = null;

    if (body.list_id) {
      const { data: listCheck, error: listError } = await sbAdmin
        .from('task_lists')
        .select('id, status, workspace_boards!inner(ws_id)')
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

      targetListStatus = listCheck.status ?? null;
    }

    if (
      normalizedAssigneeIds !== undefined &&
      normalizedAssigneeIds.length > 0
    ) {
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

      normalizedAssigneeIds = normalizedAssigneeIds.filter((assigneeId) =>
        validAssigneeIds.has(assigneeId)
      );
    }

    if (normalizedLabelIds !== undefined && normalizedLabelIds.length > 0) {
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

    if (normalizedProjectIds !== undefined && normalizedProjectIds.length > 0) {
      const { data: projects, error: projectsError } = await sbAdmin
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

    const normalizedDescription =
      body.description !== undefined
        ? body.description?.trim() || null
        : undefined;

    const baseUpdatePayload = {
      ...(body.name != null ? { name: body.name.trim() } : {}),
      ...(normalizedDescription !== undefined
        ? {
            description: normalizedDescription,
            description_yjs_state: deriveTaskDescriptionYjsState(
              normalizedDescription
            ),
          }
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
      ...(body.sort_key !== undefined ? { sort_key: body.sort_key } : {}),
      ...(body.deleted !== undefined
        ? { deleted_at: body.deleted ? new Date().toISOString() : null }
        : {}),
    };
    const expectedListId =
      body.list_id !== undefined ? body.list_id : task.list_id;

    const listChanged =
      body.list_id !== undefined && body.list_id !== task.list_id;
    const sourceListStatus = task.task_lists?.status ?? null;
    const effectiveTargetStatus = listChanged
      ? targetListStatus
      : sourceListStatus;

    let nextClosedAt = task.closed_at;
    let nextCompletedAt = task.completed_at;
    const currentCompletedState = task.completed ?? false;
    let nextCompleted = currentCompletedState;
    let shouldUpdateCompletion = false;

    if (body.closed_at !== undefined) {
      nextClosedAt = body.closed_at;
      shouldUpdateCompletion = true;
    }

    if (body.completed_at !== undefined) {
      nextCompletedAt = body.completed_at;
      shouldUpdateCompletion = true;
    }

    if (body.completed !== undefined) {
      nextCompleted = body.completed;
      shouldUpdateCompletion = true;

      const completionTimestamp =
        body.completed_at ?? body.closed_at ?? new Date().toISOString();
      if (body.completed) {
        nextCompletedAt = body.completed_at ?? completionTimestamp;
        nextClosedAt = body.closed_at ?? completionTimestamp;
      } else {
        if (body.completed_at === undefined) {
          nextCompletedAt = null;
        }
        if (body.closed_at === undefined) {
          nextClosedAt = null;
        }
      }
    }

    if (!shouldUpdateCompletion && listChanged && effectiveTargetStatus) {
      const isTargetCompletion =
        effectiveTargetStatus === 'done' || effectiveTargetStatus === 'closed';
      const isSourceCompletion =
        sourceListStatus === 'done' || sourceListStatus === 'closed';

      if (isTargetCompletion) {
        const timestamp = new Date().toISOString();
        nextClosedAt = timestamp;
        nextCompletedAt = effectiveTargetStatus === 'done' ? timestamp : null;
        nextCompleted = effectiveTargetStatus === 'done';
      } else if (isSourceCompletion) {
        nextClosedAt = null;
        nextCompletedAt = null;
        nextCompleted = false;
      }

      shouldUpdateCompletion =
        nextClosedAt !== task.closed_at ||
        nextCompletedAt !== task.completed_at ||
        nextCompleted !== currentCompletedState;
    }

    const updatePayload = {
      ...baseUpdatePayload,
      ...(shouldUpdateCompletion ? { closed_at: nextClosedAt } : {}),
      ...(shouldUpdateCompletion ? { completed_at: nextCompletedAt } : {}),
      ...(shouldUpdateCompletion ? { completed: nextCompleted } : {}),
    };

    const updateTaskRelationsPayload: TaskActorRpcArgs<'update_task_with_relations'> =
      {
        p_task_id: taskId,
        p_task_updates: updatePayload,
        p_assignee_ids: normalizedAssigneeIds,
        p_replace_assignees: body.assignee_ids !== undefined,
        p_label_ids: normalizedLabelIds,
        p_replace_labels: body.label_ids !== undefined,
        p_project_ids: normalizedProjectIds,
        p_replace_projects: body.project_ids !== undefined,
        p_actor_user_id: user.id,
      };
    const { data: updatedTaskRow, error: updateError } = await sbAdmin
      .rpc('update_task_with_relations', updateTaskRelationsPayload)
      .maybeSingle();

    if (updateError) {
      console.error('Error updating task:', updateError);
      return NextResponse.json(
        { error: 'Failed to update task' },
        { status: 500 }
      );
    }

    if (
      !updatedTaskRow ||
      updatedTaskRow.id !== task.id ||
      updatedTaskRow.list_id !== expectedListId
    ) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (body.deleted === true) {
      await removeAllLinkedTaskCalendarEvents(sbAdmin, taskId);
      await removeTaskSchedulingSettings(sbAdmin, taskId);
    } else if (nextCompleted || nextClosedAt) {
      await clampTaskScheduleToCompletedWork(sbAdmin, taskId);
    }

    const updatedTaskResult = await getWorkspaceTask(sbAdmin, wsId, taskId);

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
    if (error instanceof ZodError) {
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

    const { wsId, taskId } = access;
    const sbAdmin = await createAdminClient();
    const { task, error } = await getWorkspaceTask(sbAdmin, wsId, taskId);

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

    await removeAllLinkedTaskCalendarEvents(sbAdmin, taskId);
    await removeTaskSchedulingSettings(sbAdmin, taskId);

    const { data: deletedTaskRow, error: deleteError } = await sbAdmin
      .from('tasks')
      .delete()
      .eq('id', taskId)
      .select('id, list_id')
      .maybeSingle();

    if (deleteError) {
      console.error('Supabase error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to permanently delete task' },
        { status: 500 }
      );
    }

    if (
      !deletedTaskRow ||
      deletedTaskRow.id !== task.id ||
      deletedTaskRow.list_id !== task.list_id
    ) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Task permanently deleted',
    });
  } catch (error) {
    if (error instanceof ZodError) {
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

    const { user, wsId, taskId } = access;
    const sbAdmin = await createAdminClient();
    restoreTaskSchema.parse(await request.json());

    const { task, error } = await getWorkspaceTask(sbAdmin, wsId, taskId);

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

    const restoreTaskPayload: TaskActorRpcArgs<'update_task_fields_with_actor'> =
      {
        p_task_id: taskId,
        p_task_updates: { deleted_at: null },
        p_actor_user_id: user.id,
      };
    const { data: restoredTaskRow, error: restoreError } = await sbAdmin
      .rpc('update_task_fields_with_actor', restoreTaskPayload)
      .maybeSingle();

    if (restoreError) {
      console.error('Supabase error:', restoreError);
      return NextResponse.json(
        { error: 'Failed to restore task' },
        { status: 500 }
      );
    }

    if (
      !restoredTaskRow ||
      restoredTaskRow.id !== task.id ||
      restoredTaskRow.list_id !== task.list_id
    ) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Task restored successfully',
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
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
