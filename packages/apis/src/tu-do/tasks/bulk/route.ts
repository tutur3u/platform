import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import type { TaskActorRpcArgs } from '@tuturuuu/types/db';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const MAX_BULK_TASKS = 200;

const paramsSchema = z.object({
  wsId: z.string().min(1),
});

const updateFieldsSchema = z
  .object({
    priority: z
      .enum(['low', 'normal', 'high', 'critical'])
      .nullable()
      .optional(),
    start_date: z.string().datetime().nullable().optional(),
    end_date: z.string().datetime().nullable().optional(),
    estimation_points: z.number().int().min(0).max(8).nullable().optional(),
    deleted: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one update field is required',
  });

const operationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('update_fields'),
    updates: updateFieldsSchema,
  }),
  z.object({
    type: z.literal('move_to_list'),
    listId: z.guid(),
    targetBoardId: z.guid().optional(),
  }),
  z.object({
    type: z.literal('add_label'),
    labelId: z.guid(),
  }),
  z.object({
    type: z.literal('remove_label'),
    labelId: z.guid(),
  }),
  z.object({
    type: z.literal('add_project'),
    projectId: z.guid(),
  }),
  z.object({
    type: z.literal('remove_project'),
    projectId: z.guid(),
  }),
  z.object({
    type: z.literal('add_assignee'),
    assigneeId: z.guid(),
  }),
  z.object({
    type: z.literal('remove_assignee'),
    assigneeId: z.guid(),
  }),
  z.object({
    type: z.literal('clear_labels'),
  }),
  z.object({
    type: z.literal('clear_projects'),
  }),
  z.object({
    type: z.literal('clear_assignees'),
  }),
]);

const requestSchema = z.object({
  taskIds: z.array(z.guid()).min(1).max(MAX_BULK_TASKS),
  operation: operationSchema,
});

type BulkOperation = z.infer<typeof operationSchema>;
type TaskUpdateRpcJson =
  Database['public']['Functions']['update_task_fields_with_actor']['Args']['p_task_updates'];

type TaskContextRow = {
  id: string;
  list_id: string;
  completed: boolean | null;
  completed_at: string | null;
  closed_at: string | null;
  task_lists: {
    status: string | null;
    board_id: string;
    workspace_boards: { ws_id: string } | null;
  } | null;
};

type TargetListRow = {
  id: string;
  board_id: string;
  status: string | null;
  deleted: boolean | null;
  workspace_boards: { ws_id: string } | null;
};

async function parseJsonBody(request: NextRequest) {
  try {
    return { data: await request.json(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

type MoveTaskUpdates = {
  list_id: string;
  completed: boolean | null;
  completed_at: string | null;
  closed_at: string | null;
  display_number?: null;
};

type UpdateFieldsPayload = {
  priority?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  estimation_points?: number | null;
  deleted_at?: string | null;
};

function isCompletionStatus(status: string | null | undefined) {
  return status === 'done' || status === 'closed';
}

function buildMoveTaskUpdates(
  operationTimestamp: string,
  task: TaskContextRow,
  targetList: TargetListRow
): MoveTaskUpdates {
  const sourceStatus = task.task_lists?.status ?? null;
  const targetStatus = targetList.status;
  const sourceIsCompletion = isCompletionStatus(sourceStatus);
  const targetIsCompletion = isCompletionStatus(targetStatus);
  const transitioningIntoCompletion = !sourceIsCompletion && targetIsCompletion;
  const transitioningOutOfCompletion =
    sourceIsCompletion && !targetIsCompletion;

  let closedAt: string | null;
  if (transitioningIntoCompletion) {
    closedAt = operationTimestamp;
  } else if (transitioningOutOfCompletion) {
    closedAt = null;
  } else {
    closedAt = task.closed_at;
  }

  let completed: boolean | null;
  let completedAt: string | null;

  if (transitioningIntoCompletion) {
    completed = true;
    completedAt = operationTimestamp;
  } else if (transitioningOutOfCompletion) {
    completed = false;
    completedAt = null;
  } else {
    completed = task.completed;
    completedAt = task.completed_at;
  }

  const movedToDifferentBoard =
    task.task_lists?.board_id &&
    task.task_lists.board_id !== targetList.board_id;

  return {
    list_id: targetList.id,
    closed_at: closedAt,
    completed,
    completed_at: completedAt,
    ...(movedToDifferentBoard ? { display_number: null } : {}),
  };
}

function buildTaskUpdatePayload(
  operation: Extract<BulkOperation, { type: 'update_fields' }>
): UpdateFieldsPayload {
  const updates: UpdateFieldsPayload = {};
  const operationUpdates = operation.updates;

  if (operationUpdates.priority !== undefined) {
    updates.priority = operationUpdates.priority;
  }
  if (operationUpdates.start_date !== undefined) {
    updates.start_date = operationUpdates.start_date;
  }
  if (operationUpdates.end_date !== undefined) {
    updates.end_date = operationUpdates.end_date;
  }
  if (operationUpdates.estimation_points !== undefined) {
    updates.estimation_points = operationUpdates.estimation_points;
  }
  if (operationUpdates.deleted !== undefined) {
    updates.deleted_at = operationUpdates.deleted
      ? new Date().toISOString()
      : null;
  }

  return updates;
}

async function verifyWorkspaceMembership(
  wsId: string,
  userId: string,
  supabase: TypedSupabaseClient
) {
  const membership = await verifyWorkspaceMembershipType({
    wsId,
    userId,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { error: null };
}

async function loadTargetList(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  operation: BulkOperation
) {
  if (operation.type !== 'move_to_list') {
    return { targetList: null, errorResponse: null };
  }

  const { data: targetList, error } = await sbAdmin
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
    .eq('id', operation.listId)
    .maybeSingle();

  if (error) {
    return {
      targetList: null,
      errorResponse: NextResponse.json(
        { error: 'Failed to load target list' },
        { status: 500 }
      ),
    };
  }

  if (!targetList || targetList.workspace_boards?.ws_id !== wsId) {
    return {
      targetList: null,
      errorResponse: NextResponse.json(
        { error: 'Target list not found' },
        { status: 404 }
      ),
    };
  }

  if (targetList.deleted) {
    return {
      targetList: null,
      errorResponse: NextResponse.json(
        { error: 'Target list is archived' },
        { status: 400 }
      ),
    };
  }

  if (
    operation.targetBoardId &&
    operation.targetBoardId !== targetList.board_id
  ) {
    return {
      targetList: null,
      errorResponse: NextResponse.json(
        { error: 'Target list does not belong to target board' },
        { status: 400 }
      ),
    };
  }

  return {
    targetList: targetList as TargetListRow,
    errorResponse: null,
  };
}

async function validateOperationScope(
  supabase: TypedSupabaseClient,
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  operation: BulkOperation
) {
  if (operation.type === 'add_label' || operation.type === 'remove_label') {
    const { data, error } = await supabase
      .from('workspace_task_labels')
      .select('id')
      .eq('ws_id', wsId)
      .eq('id', operation.labelId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to validate label' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Label not found in workspace' },
        { status: 404 }
      );
    }
  }

  if (operation.type === 'add_project' || operation.type === 'remove_project') {
    const { data, error } = await sbAdmin
      .from('task_projects')
      .select('id')
      .eq('ws_id', wsId)
      .eq('id', operation.projectId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to validate project' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Project not found in workspace' },
        { status: 404 }
      );
    }
  }

  if (
    operation.type === 'add_assignee' ||
    operation.type === 'remove_assignee'
  ) {
    const assigneeMembership = await verifyWorkspaceMembershipType({
      wsId,
      userId: operation.assigneeId,
      supabase,
      requiredType: 'MEMBER',
    });

    if (assigneeMembership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to validate assignee' },
        { status: 500 }
      );
    }

    if (!assigneeMembership.ok) {
      return NextResponse.json(
        { error: 'Assignee is not a workspace member' },
        { status: 404 }
      );
    }
  }

  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient(request);
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wsId = await normalizeWorkspaceId(parsedParams.data.wsId, supabase);

    const membership = await verifyWorkspaceMembership(wsId, user.id, supabase);
    if (membership.error) {
      return membership.error;
    }

    const jsonResult = await parseJsonBody(request);
    if (jsonResult.error) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const parsedBody = requestSchema.safeParse(jsonResult.data);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsedBody.error.issues },
        { status: 400 }
      );
    }

    const taskIds = [...new Set(parsedBody.data.taskIds)];
    const operation = parsedBody.data.operation;
    const sbAdmin = await createAdminClient();

    const scopeValidationError = await validateOperationScope(
      supabase,
      sbAdmin,
      wsId,
      operation
    );
    if (scopeValidationError) {
      return scopeValidationError;
    }

    const { targetList, errorResponse } = await loadTargetList(
      sbAdmin,
      wsId,
      operation
    );

    if (errorResponse) {
      return errorResponse;
    }

    const { data: taskRows, error: taskLoadError } = await sbAdmin
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
      .in('id', taskIds)
      .eq('task_lists.workspace_boards.ws_id', wsId);

    if (taskLoadError) {
      return NextResponse.json(
        { error: 'Failed to load tasks' },
        { status: 500 }
      );
    }

    const taskById = new Map(
      ((taskRows as TaskContextRow[] | null) ?? []).map((task) => [
        task.id,
        task,
      ])
    );

    const assigneeMapByTaskId = new Map<string, string[]>();
    if (
      operation.type === 'add_assignee' ||
      operation.type === 'remove_assignee'
    ) {
      const { data: taskAssignees, error: assigneeError } = await sbAdmin
        .from('task_assignees')
        .select('task_id, user_id')
        .in('task_id', taskIds);

      if (assigneeError) {
        return NextResponse.json(
          { error: 'Failed to load task assignees' },
          { status: 500 }
        );
      }

      for (const row of taskAssignees ?? []) {
        if (!assigneeMapByTaskId.has(row.task_id)) {
          assigneeMapByTaskId.set(row.task_id, []);
        }
        assigneeMapByTaskId.get(row.task_id)?.push(row.user_id);
      }
    }

    const succeededTaskIds: string[] = [];
    const failures: Array<{ taskId: string; error: string }> = [];
    const taskMetaById: Record<
      string,
      {
        list_id?: string;
        completed_at?: string | null;
        closed_at?: string | null;
      }
    > = {};

    const staticUpdatePayload =
      operation.type === 'update_fields'
        ? buildTaskUpdatePayload(operation)
        : null;
    const operationTimestamp = new Date().toISOString();

    for (const taskId of taskIds) {
      const task = taskById.get(taskId);

      if (!task) {
        failures.push({ taskId, error: 'Task not found' });
        continue;
      }

      try {
        switch (operation.type) {
          case 'update_fields': {
            const updatePayload: TaskActorRpcArgs<'update_task_fields_with_actor'> =
              {
                p_task_id: taskId,
                p_task_updates: (staticUpdatePayload ??
                  {}) as TaskUpdateRpcJson,
                p_actor_user_id: user.id,
              };
            const { error } = await sbAdmin.rpc(
              'update_task_fields_with_actor',
              updatePayload
            );
            if (error) {
              throw error;
            }
            break;
          }

          case 'move_to_list': {
            if (!targetList) {
              throw new Error('Target list not found');
            }

            const moveUpdates = buildMoveTaskUpdates(
              operationTimestamp,
              task,
              targetList
            );
            const updatePayload: TaskActorRpcArgs<'update_task_fields_with_actor'> =
              {
                p_task_id: taskId,
                p_task_updates: moveUpdates as TaskUpdateRpcJson,
                p_actor_user_id: user.id,
              };

            const { error } = await sbAdmin.rpc(
              'update_task_fields_with_actor',
              updatePayload
            );
            if (error) {
              throw error;
            }

            taskMetaById[taskId] = {
              list_id: targetList.id,
              completed_at:
                typeof moveUpdates.completed_at === 'string'
                  ? moveUpdates.completed_at
                  : moveUpdates.completed_at === null
                    ? null
                    : task.completed_at,
              closed_at:
                typeof moveUpdates.closed_at === 'string'
                  ? moveUpdates.closed_at
                  : moveUpdates.closed_at === null
                    ? null
                    : task.closed_at,
            };
            break;
          }

          case 'add_label': {
            const payload: TaskActorRpcArgs<'add_task_label_with_actor'> = {
              p_task_id: taskId,
              p_label_id: operation.labelId,
              p_actor_user_id: user.id,
            };
            const { error } = await sbAdmin.rpc(
              'add_task_label_with_actor',
              payload
            );
            if (error && error.code !== '23505') {
              throw error;
            }
            break;
          }

          case 'remove_label': {
            const payload: TaskActorRpcArgs<'remove_task_label_with_actor'> = {
              p_task_id: taskId,
              p_label_id: operation.labelId,
              p_actor_user_id: user.id,
            };
            const { error } = await sbAdmin.rpc(
              'remove_task_label_with_actor',
              payload
            );
            if (error) {
              throw error;
            }
            break;
          }

          case 'add_project': {
            const payload: TaskActorRpcArgs<'link_task_project_with_actor'> = {
              p_task_id: taskId,
              p_project_id: operation.projectId,
              p_actor_user_id: user.id,
            };
            const { error } = await sbAdmin.rpc(
              'link_task_project_with_actor',
              payload
            );
            if (error && error.code !== '23505') {
              throw error;
            }
            break;
          }

          case 'remove_project': {
            const payload: TaskActorRpcArgs<'unlink_task_project_with_actor'> =
              {
                p_task_id: taskId,
                p_project_id: operation.projectId,
                p_actor_user_id: user.id,
              };
            const { error } = await sbAdmin.rpc(
              'unlink_task_project_with_actor',
              payload
            );
            if (error) {
              throw error;
            }
            break;
          }

          case 'add_assignee':
          case 'remove_assignee':
          case 'clear_assignees': {
            const currentAssignees = assigneeMapByTaskId.get(taskId) ?? [];
            const nextAssigneeIds =
              operation.type === 'clear_assignees'
                ? []
                : operation.type === 'add_assignee'
                  ? [...new Set([...currentAssignees, operation.assigneeId])]
                  : currentAssignees.filter(
                      (id) => id !== operation.assigneeId
                    );

            const payload: TaskActorRpcArgs<'update_task_with_relations'> = {
              p_task_id: taskId,
              p_task_updates: {} as TaskUpdateRpcJson,
              p_assignee_ids: nextAssigneeIds,
              p_replace_assignees: true,
              p_label_ids: undefined,
              p_replace_labels: false,
              p_project_ids: undefined,
              p_replace_projects: false,
              p_actor_user_id: user.id,
            };
            const { error } = await sbAdmin.rpc(
              'update_task_with_relations',
              payload
            );
            if (error) {
              throw error;
            }
            break;
          }

          case 'clear_labels': {
            const payload: TaskActorRpcArgs<'update_task_with_relations'> = {
              p_task_id: taskId,
              p_task_updates: {} as TaskUpdateRpcJson,
              p_assignee_ids: undefined,
              p_replace_assignees: false,
              p_label_ids: [],
              p_replace_labels: true,
              p_project_ids: undefined,
              p_replace_projects: false,
              p_actor_user_id: user.id,
            };
            const { error } = await sbAdmin.rpc(
              'update_task_with_relations',
              payload
            );
            if (error) {
              throw error;
            }
            break;
          }

          case 'clear_projects': {
            const payload: TaskActorRpcArgs<'update_task_with_relations'> = {
              p_task_id: taskId,
              p_task_updates: {} as TaskUpdateRpcJson,
              p_assignee_ids: undefined,
              p_replace_assignees: false,
              p_label_ids: undefined,
              p_replace_labels: false,
              p_project_ids: [],
              p_replace_projects: true,
              p_actor_user_id: user.id,
            };
            const { error } = await sbAdmin.rpc(
              'update_task_with_relations',
              payload
            );
            if (error) {
              throw error;
            }
            break;
          }
        }

        succeededTaskIds.push(taskId);
      } catch (error) {
        failures.push({
          taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      successCount: succeededTaskIds.length,
      failCount: failures.length,
      taskIds,
      succeededTaskIds,
      failures,
      taskMetaById,
    });
  } catch (error) {
    console.error('Error processing bulk task operation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
