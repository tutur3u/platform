import { resolveTaskBoardAccess } from '@tuturuuu/apis/tu-do/board-access';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import {
  getPersonalExternalStagingListId,
  isPersonalExternalStagingListId,
} from '@tuturuuu/utils/task-helper';
import {
  isTaskBoardCompletedStatus,
  isTaskBoardResolvedStatus,
  isTaskBoardTerminalStatus,
} from '@tuturuuu/utils/task-list-status';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const TERMINAL_STATUSES = ['done', 'closed'] as const;

const placementSchema = z.object({
  personal_board_id: z.guid(),
  personal_list_id: z.guid().nullable().optional(),
  personal_sort_key: z.number().finite().nullable().optional(),
  previous_task_id: z.guid().nullable().optional(),
  next_task_id: z.guid().nullable().optional(),
  terminal_status: z.enum(TERMINAL_STATUSES).optional(),
});

const PERSONAL_PLACEMENT_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'calendar', 'tasks'],
} as const;

type SourceTaskRow = {
  id: string;
  display_number: number | null;
  name: string | null;
  description: string | null;
  priority: string | null;
  completed: boolean | null;
  completed_at: string | null;
  sort_key: number | null;
  start_date: string | null;
  end_date: string | null;
  estimation_points: number | null;
  created_at: string | null;
  list_id: string | null;
  closed_at: string | null;
  deleted_at: string | null;
  task_lists?: {
    id: string;
    name: string | null;
    status: string | null;
    color: string | null;
    deleted: boolean | null;
    board_id: string | null;
    workspace_boards?: {
      id: string;
      name: string | null;
      ticket_prefix: string | null;
      ws_id: string | null;
      deleted_at: string | null;
      archived_at: string | null;
      workspaces?: {
        id: string;
        name: string | null;
        personal: boolean | null;
      } | null;
    } | null;
  } | null;
};

type PlacementRow = {
  personal_board_id: string;
  personal_list_id: string | null;
  personal_sort_key: number | null;
  personal_added_at: string | null;
  personal_placed_at: string | null;
};

type TargetBoardRow = {
  id: string;
  ws_id: string | null;
  deleted_at: string | null;
  archived_at: string | null;
  workspaces?: {
    id?: string | null;
    personal?: boolean | null;
  } | null;
};

type TargetListRow = {
  id: string;
  board_id: string | null;
  color?: string | null;
  created_at?: string | null;
  deleted: boolean | null;
  name?: string | null;
  position?: number | null;
  status?: string | null;
  workspace_boards?: TargetBoardRow | null;
};

type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

type TerminalListRow = {
  id: string;
  board_id: string | null;
  color: string | null;
  created_at: string | null;
  deleted: boolean | null;
  name: string | null;
  position: number | null;
  status: string | null;
};

async function hasCurrentUserTaskVisibility(
  sbAdmin: any,
  taskId: string,
  userId: string
) {
  const [
    { data: assignment, error: assignmentError },
    { data: override, error: overrideError },
  ] = await Promise.all([
    (sbAdmin as any)
      .from('task_assignees')
      .select('task_id')
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .maybeSingle(),
    (sbAdmin as any)
      .from('task_user_overrides')
      .select('task_id')
      .eq('task_id', taskId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (assignmentError || overrideError) {
    return { error: true, ok: false };
  }

  return { error: false, ok: Boolean(assignment || override) };
}

function buildPlacedTask(sourceTask: SourceTaskRow, placement: PlacementRow) {
  const sourceList = sourceTask.task_lists;
  const sourceBoard = sourceList?.workspace_boards;
  const sourceWorkspace = sourceBoard?.workspaces;
  const effectiveListId =
    placement.personal_list_id ??
    getPersonalExternalStagingListId(placement.personal_board_id);

  return {
    ...sourceTask,
    name: sourceTask.name ?? '',
    display_number: sourceTask.display_number ?? 0,
    created_at: sourceTask.created_at ?? new Date().toISOString(),
    source_workspace_id: sourceBoard?.ws_id ?? null,
    source_workspace_name: sourceWorkspace?.name ?? null,
    source_board_id: sourceBoard?.id ?? null,
    source_board_name: sourceBoard?.name ?? null,
    source_list_id: sourceList?.id ?? sourceTask.list_id ?? null,
    source_list_name: sourceList?.name ?? null,
    source_list_status: sourceList?.status ?? null,
    personal_board_id: placement.personal_board_id,
    personal_list_id: placement.personal_list_id,
    personal_sort_key: placement.personal_sort_key,
    personal_added_at: placement.personal_added_at,
    personal_placed_at: placement.personal_placed_at,
    is_personal_external: true,
    is_personal_external_default: false,
    list_id: effectiveListId,
    sort_key: placement.personal_sort_key ?? sourceTask.sort_key,
  };
}

function getTerminalDefaultColumn(status: TerminalStatus) {
  return status === 'done' ? 'default_done_list_id' : 'default_closed_list_id';
}

function isTerminalDefaultColumnUnavailable(
  error: { code?: string; message?: string } | null | undefined,
  status: TerminalStatus
) {
  if (!error) return false;
  const column = getTerminalDefaultColumn(status);
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    (typeof error.message === 'string' && error.message.includes(column))
  );
}

async function loadTerminalDefaultListId(
  sbAdmin: any,
  boardId: string,
  status: TerminalStatus
) {
  const column = getTerminalDefaultColumn(status);
  const { data, error } = await (sbAdmin as any)
    .from('workspace_boards')
    .select(column)
    .eq('id', boardId)
    .maybeSingle();

  if (error) {
    if (isTerminalDefaultColumnUnavailable(error, status)) {
      return { listId: null, response: null };
    }

    return {
      listId: null,
      response: NextResponse.json(
        { error: 'Failed to load terminal default list' },
        { status: 500 }
      ),
    };
  }

  const listId = (data as Record<string, string | null> | null)?.[column];
  return { listId: listId ?? null, response: null };
}

async function loadTerminalListById({
  boardId,
  listId,
  sbAdmin,
  status,
}: {
  boardId: string;
  listId: string;
  sbAdmin: any;
  status: TerminalStatus;
}) {
  const { data, error } = await (sbAdmin as any)
    .from('task_lists')
    .select('id, board_id, name, status, color, position, deleted, created_at')
    .eq('id', listId)
    .eq('board_id', boardId)
    .eq('deleted', false)
    .eq('status', status)
    .maybeSingle();

  if (error) {
    return {
      list: null,
      response: NextResponse.json(
        { error: 'Failed to load terminal list' },
        { status: 500 }
      ),
    };
  }

  return { list: (data as TerminalListRow | null) ?? null, response: null };
}

async function loadFirstTerminalList({
  boardId,
  sbAdmin,
  status,
}: {
  boardId: string;
  sbAdmin: any;
  status: TerminalStatus;
}) {
  const { data, error } = await (sbAdmin as any)
    .from('task_lists')
    .select('id, board_id, name, status, color, position, deleted, created_at')
    .eq('board_id', boardId)
    .eq('deleted', false)
    .eq('status', status)
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    return {
      list: null,
      response: NextResponse.json(
        { error: 'Failed to load terminal list' },
        { status: 500 }
      ),
    };
  }

  const list = Array.isArray(data) ? data[0] : data;
  return { list: (list as TerminalListRow | null) ?? null, response: null };
}

async function resolveTerminalListForBoard({
  boardId,
  explicitListId,
  sbAdmin,
  status,
}: {
  boardId: string;
  explicitListId?: string | null;
  sbAdmin: any;
  status: TerminalStatus;
}) {
  if (explicitListId) {
    const explicit = await loadTerminalListById({
      boardId,
      listId: explicitListId,
      sbAdmin,
      status,
    });

    if (explicit.response) return explicit;
    if (explicit.list) return explicit;
  }

  const defaultList = await loadTerminalDefaultListId(sbAdmin, boardId, status);
  if (defaultList.response) {
    return { list: null, response: defaultList.response };
  }

  if (defaultList.listId) {
    const resolvedDefault = await loadTerminalListById({
      boardId,
      listId: defaultList.listId,
      sbAdmin,
      status,
    });

    if (resolvedDefault.response) return resolvedDefault;
    if (resolvedDefault.list) return resolvedDefault;
  }

  return loadFirstTerminalList({ boardId, sbAdmin, status });
}

function getTerminalSourceUpdatePayload(
  sourceTask: SourceTaskRow,
  targetList: TerminalListRow
) {
  const sourceListStatus = sourceTask.task_lists?.status;
  const targetStatus = targetList.status;
  const isTargetResolved = isTaskBoardResolvedStatus(targetStatus);
  const isSourceResolved = isTaskBoardResolvedStatus(sourceListStatus);
  const isTargetCompleted = isTaskBoardCompletedStatus(targetStatus);
  const isSourceCompleted = isTaskBoardCompletedStatus(sourceListStatus);
  const isTargetTerminal = isTaskBoardTerminalStatus(targetStatus);
  const isSourceTerminal = isTaskBoardTerminalStatus(sourceListStatus);
  const currentCompletedState = Boolean(sourceTask.completed);

  let nextClosedAt = sourceTask.closed_at;
  let nextCompletedAt = sourceTask.completed_at;
  let nextCompleted = currentCompletedState;

  if (targetStatus === 'review') {
    nextClosedAt = null;
    nextCompletedAt = null;
    nextCompleted = false;
  } else if (isTargetResolved) {
    const timestamp = new Date().toISOString();
    if (!isSourceTerminal && isTargetTerminal) {
      nextClosedAt = timestamp;
    } else if (isSourceTerminal && !isTargetTerminal) {
      nextClosedAt = null;
    }
    nextCompletedAt = isTargetCompleted
      ? (sourceTask.completed_at ?? timestamp)
      : isSourceCompleted
        ? sourceTask.completed_at
        : null;
    nextCompleted = true;
  } else if (isSourceResolved) {
    nextClosedAt = null;
    nextCompletedAt = null;
    nextCompleted = false;
  }

  return {
    closed_at: nextClosedAt,
    completed: nextCompleted,
    completed_at: nextCompletedAt,
    list_id: targetList.id,
  };
}

async function updateSourceTaskTerminalStatus({
  sbAdmin,
  sourceTask,
  targetList,
  taskId,
  userId,
}: {
  sbAdmin: any;
  sourceTask: SourceTaskRow;
  targetList: TerminalListRow;
  taskId: string;
  userId: string;
}) {
  const updateQuery = (sbAdmin as any).rpc('update_task_with_relations', {
    p_task_id: taskId,
    p_task_updates: getTerminalSourceUpdatePayload(sourceTask, targetList),
    p_assignee_ids: undefined,
    p_replace_assignees: false,
    p_label_ids: undefined,
    p_replace_labels: false,
    p_project_ids: undefined,
    p_replace_projects: false,
    p_actor_user_id: userId,
  });
  const { data, error } =
    typeof updateQuery?.maybeSingle === 'function'
      ? await updateQuery.maybeSingle()
      : await updateQuery;

  if (error || !data) {
    return NextResponse.json(
      { error: 'Failed to update source task' },
      { status: 500 }
    );
  }

  return null;
}

async function loadSourceTask(sbAdmin: any, taskId: string) {
  const { data, error } = await (sbAdmin as any)
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
        sort_key,
        start_date,
        end_date,
        estimation_points,
        created_at,
        list_id,
        closed_at,
        deleted_at,
        task_lists!inner (
          id,
          name,
          status,
          color,
          deleted,
          board_id,
          workspace_boards!inner (
            id,
            name,
            ticket_prefix,
            ws_id,
            deleted_at,
            archived_at,
            workspaces!inner (
              id,
              name,
              personal
            )
          )
        )
      `
    )
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !data) {
    return {
      task: null,
      response: NextResponse.json({ error: 'Task not found' }, { status: 404 }),
    };
  }

  const task = data as SourceTaskRow;
  const sourceList = task.task_lists;
  const sourceBoard = sourceList?.workspace_boards;

  if (
    !sourceList ||
    sourceList.deleted ||
    !sourceBoard?.ws_id ||
    sourceBoard.deleted_at ||
    sourceBoard.archived_at
  ) {
    return {
      task: null,
      response: NextResponse.json({ error: 'Task not found' }, { status: 404 }),
    };
  }

  return { task, response: null };
}

async function resolvePersonalPlacementTarget(
  sbAdmin: any,
  personalBoardId: string,
  personalListId: string | null
): Promise<{
  effectivePersonalBoardId: string | null;
  targetBoard: TargetBoardRow | null;
  targetListId: string | null;
  response: NextResponse | null;
}> {
  if (personalListId) {
    const { data: targetList, error: targetListError } = await (sbAdmin as any)
      .from('task_lists')
      .select(
        `
          id,
          board_id,
          deleted,
          workspace_boards!inner (
            id,
            ws_id,
            deleted_at,
            archived_at,
            workspaces!inner (
              id,
              personal
            )
          )
        `
      )
      .eq('id', personalListId)
      .maybeSingle();

    if (targetListError) {
      return {
        effectivePersonalBoardId: null,
        targetBoard: null,
        targetListId: null,
        response: NextResponse.json(
          { error: 'Failed to load personal list' },
          { status: 500 }
        ),
      };
    }

    const list = targetList as TargetListRow | null;

    if (!list || list.deleted) {
      return {
        effectivePersonalBoardId: null,
        targetBoard: null,
        targetListId: null,
        response: NextResponse.json(
          { error: 'Personal list not found' },
          { status: 404 }
        ),
      };
    }

    const targetBoard = list.workspace_boards ?? null;

    if (!targetBoard?.id || !targetBoard.ws_id) {
      return {
        effectivePersonalBoardId: null,
        targetBoard: null,
        targetListId: null,
        response: NextResponse.json(
          { error: 'Personal board not found' },
          { status: 404 }
        ),
      };
    }

    if (list.board_id && list.board_id !== targetBoard.id) {
      return {
        effectivePersonalBoardId: null,
        targetBoard: null,
        targetListId: null,
        response: NextResponse.json(
          { error: 'Personal board not found' },
          { status: 404 }
        ),
      };
    }

    return {
      effectivePersonalBoardId: targetBoard.id,
      targetBoard,
      targetListId: personalListId,
      response: null,
    };
  }

  const { data: targetBoard, error: targetBoardError } = await (sbAdmin as any)
    .from('workspace_boards')
    .select(
      `
        id,
        ws_id,
        deleted_at,
        archived_at,
        workspaces!inner (
          id,
          personal
        )
      `
    )
    .eq('id', personalBoardId)
    .maybeSingle();

  if (targetBoardError) {
    return {
      effectivePersonalBoardId: null,
      targetBoard: null,
      targetListId: null,
      response: NextResponse.json(
        { error: 'Failed to load personal board' },
        { status: 500 }
      ),
    };
  }

  if (!targetBoard) {
    return {
      effectivePersonalBoardId: null,
      targetBoard: null,
      targetListId: null,
      response: NextResponse.json(
        { error: 'Personal board not found' },
        { status: 404 }
      ),
    };
  }

  return {
    effectivePersonalBoardId: personalBoardId,
    targetBoard: targetBoard as TargetBoardRow,
    targetListId: null,
    response: null,
  };
}

async function verifyPersonalPlacementDestinationAccess({
  effectivePersonalBoardId,
  resolvedPersonalListId,
  sbAdmin,
  supabase,
  targetWsId,
  user,
}: {
  effectivePersonalBoardId: string;
  resolvedPersonalListId: string | null;
  sbAdmin: any;
  supabase: any;
  targetWsId: string;
  user: SupabaseUser;
}) {
  const targetMembership = await verifyWorkspaceMembershipType({
    requiredType: 'ANY',
    wsId: targetWsId,
    userId: user.id,
    supabase,
  });

  if (targetMembership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify destination access' },
      { status: 500 }
    );
  }

  if (targetMembership.ok) {
    return null;
  }

  const targetAccess = await resolveTaskBoardAccess({
    boardId: effectivePersonalBoardId,
    listId: resolvedPersonalListId,
    requiredPermission: 'edit',
    sbAdmin: sbAdmin as any,
    supabase,
    user,
    wsId: targetWsId,
  });

  if ('error' in targetAccess) {
    if (targetAccess.error.status >= 500) {
      return NextResponse.json(
        { error: 'Failed to verify destination access' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Personal board not found' },
      { status: 404 }
    );
  }

  return null;
}

export const PUT = withSessionAuth<{ taskId: string }>(
  async (req, { user, supabase }, { taskId }) => {
    if (!validate(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const parsed = placementSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const sbAdmin = await createAdminClient({ noCookie: true });
    const { task: sourceTask, response } = await loadSourceTask(
      sbAdmin,
      taskId
    );

    if (!sourceTask) {
      return response;
    }

    const sourceBoard = sourceTask.task_lists?.workspace_boards;
    const sourceWsId = sourceBoard?.ws_id;

    if (!sourceWsId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const sourceMembership = await verifyWorkspaceMembershipType({
      wsId: sourceWsId,
      userId: user.id,
      supabase: supabase as any,
    });
    const sourceVisibility = sourceMembership.ok
      ? { error: false, ok: true }
      : await hasCurrentUserTaskVisibility(sbAdmin, taskId, user.id);

    if (
      sourceMembership.error === 'membership_lookup_failed' ||
      sourceVisibility.error
    ) {
      return NextResponse.json(
        { error: 'Failed to verify source task access' },
        { status: 500 }
      );
    }

    if (!sourceVisibility.ok) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { personal_board_id, personal_sort_key, terminal_status } =
      parsed.data;
    const personalListId =
      parsed.data.personal_list_id &&
      !isPersonalExternalStagingListId(parsed.data.personal_list_id)
        ? parsed.data.personal_list_id
        : null;

    const {
      effectivePersonalBoardId,
      targetBoard,
      targetListId: resolvedPersonalListId,
      response: targetResponse,
    } = await resolvePersonalPlacementTarget(
      sbAdmin,
      personal_board_id,
      terminal_status ? null : personalListId
    );

    if (!targetBoard) {
      return (
        targetResponse ??
        NextResponse.json(
          { error: 'Personal board not found' },
          { status: 404 }
        )
      );
    }

    if (!effectivePersonalBoardId) {
      return NextResponse.json(
        { error: 'Personal board not found' },
        { status: 404 }
      );
    }

    const targetWsId = targetBoard.ws_id as string | null;
    const targetWorkspace = targetBoard.workspaces as
      | { id?: string | null; personal?: boolean | null }
      | null
      | undefined;

    if (
      !targetWsId ||
      targetBoard.deleted_at ||
      targetBoard.archived_at ||
      targetWorkspace?.personal !== true
    ) {
      return NextResponse.json(
        { error: 'Destination board must be personal' },
        { status: 400 }
      );
    }

    const sourceBoardId = sourceBoard?.id ?? null;
    const sourceWorkspacePersonal = sourceBoard?.workspaces?.personal === true;
    const isWorkspaceExternalSource =
      !sourceWorkspacePersonal && sourceWsId !== targetWsId;
    const isPersonalBoardExternalSource =
      sourceWorkspacePersonal &&
      sourceWsId === targetWsId &&
      sourceBoardId !== effectivePersonalBoardId;

    if (!isWorkspaceExternalSource && !isPersonalBoardExternalSource) {
      return NextResponse.json(
        {
          error:
            'Only external workspace tasks or board-external personal tasks can be placed on a personal board',
        },
        { status: 400 }
      );
    }

    let finalPersonalListId = resolvedPersonalListId;
    let sourceTerminalList: TerminalListRow | null = null;

    if (terminal_status) {
      const personalTerminalList = await resolveTerminalListForBoard({
        boardId: effectivePersonalBoardId,
        explicitListId: personalListId,
        sbAdmin,
        status: terminal_status,
      });

      if (personalTerminalList.response) return personalTerminalList.response;
      if (!personalTerminalList.list) {
        return NextResponse.json(
          { error: `Personal board has no ${terminal_status} list` },
          { status: 400 }
        );
      }

      finalPersonalListId = personalTerminalList.list.id;

      if (!sourceBoardId) {
        return NextResponse.json(
          { error: 'Source board not found' },
          { status: 404 }
        );
      }

      const resolvedSourceTerminalList = await resolveTerminalListForBoard({
        boardId: sourceBoardId,
        sbAdmin,
        status: terminal_status,
      });

      if (resolvedSourceTerminalList.response) {
        return resolvedSourceTerminalList.response;
      }

      if (!resolvedSourceTerminalList.list) {
        return NextResponse.json(
          { error: `Source board has no ${terminal_status} list` },
          { status: 400 }
        );
      }

      sourceTerminalList = resolvedSourceTerminalList.list;
    }

    const destinationAccessResponse =
      await verifyPersonalPlacementDestinationAccess({
        effectivePersonalBoardId,
        resolvedPersonalListId: finalPersonalListId,
        sbAdmin,
        supabase: supabase as any,
        targetWsId,
        user,
      });

    if (destinationAccessResponse) {
      return destinationAccessResponse;
    }

    let responseSourceTask = sourceTask;

    if (sourceTerminalList) {
      const sourceUpdateResponse = await updateSourceTaskTerminalStatus({
        sbAdmin,
        sourceTask,
        targetList: sourceTerminalList,
        taskId,
        userId: user.id,
      });

      if (sourceUpdateResponse) return sourceUpdateResponse;

      const { task: reloadedSourceTask, response: reloadResponse } =
        await loadSourceTask(sbAdmin, taskId);

      if (!reloadedSourceTask) {
        return (
          reloadResponse ??
          NextResponse.json({ error: 'Task not found' }, { status: 404 })
        );
      }

      responseSourceTask = reloadedSourceTask;
    }

    const { data: placementRows, error: saveError } = await (
      sbAdmin as any
    ).rpc('upsert_personal_task_placement', {
      p_task_id: taskId,
      p_user_id: user.id,
      p_personal_board_id: effectivePersonalBoardId,
      p_personal_list_id: finalPersonalListId,
      p_personal_sort_key: personal_sort_key ?? null,
      p_previous_task_id: parsed.data.previous_task_id ?? null,
      p_next_task_id: parsed.data.next_task_id ?? null,
    });
    const savedPlacement = Array.isArray(placementRows)
      ? placementRows[0]
      : placementRows;

    if (saveError || !savedPlacement) {
      return NextResponse.json(
        { error: 'Failed to save personal placement' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      task: buildPlacedTask(responseSourceTask, savedPlacement as PlacementRow),
    });
  },
  { allowAppSessionAuth: PERSONAL_PLACEMENT_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<{ taskId: string }>(
  async (_req, { user, supabase }, { taskId }) => {
    if (!validate(taskId)) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    const sbAdmin = await createAdminClient({ noCookie: true });
    const { task: sourceTask, response } = await loadSourceTask(
      sbAdmin,
      taskId
    );

    if (!sourceTask) {
      return response;
    }

    const sourceWsId = sourceTask.task_lists?.workspace_boards?.ws_id;
    if (!sourceWsId) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const sourceMembership = await verifyWorkspaceMembershipType({
      wsId: sourceWsId,
      userId: user.id,
      supabase: supabase as any,
    });

    if (sourceMembership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify source task access' },
        { status: 500 }
      );
    }

    if (!sourceMembership.ok) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const { error } = await (sbAdmin as any)
      .from('task_user_overrides')
      .update({
        personal_board_id: null,
        personal_list_id: null,
        personal_sort_key: null,
        personal_added_at: null,
        personal_placed_at: null,
      })
      .eq('task_id', taskId)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json(
        { error: 'Failed to remove personal placement' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  },
  { allowAppSessionAuth: PERSONAL_PLACEMENT_APP_SESSION_AUTH }
);
