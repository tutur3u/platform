import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPersonalExternalStagingListId,
  isPersonalExternalStagingListId,
} from '@tuturuuu/utils/task-helper';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const placementSchema = z.object({
  personal_board_id: z.guid(),
  personal_list_id: z.guid().nullable().optional(),
  personal_sort_key: z.number().finite().nullable().optional(),
  previous_task_id: z.guid().nullable().optional(),
  next_task_id: z.guid().nullable().optional(),
});

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
  deleted: boolean | null;
  workspace_boards?: TargetBoardRow | null;
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
        targetBoard: null,
        targetListId: null,
        response: NextResponse.json(
          { error: 'Personal board not found' },
          { status: 404 }
        ),
      };
    }

    if (
      list.board_id !== personalBoardId ||
      targetBoard.id !== personalBoardId
    ) {
      return {
        targetBoard: null,
        targetListId: null,
        response: NextResponse.json(
          { error: 'Personal list does not belong to personal board' },
          { status: 400 }
        ),
      };
    }

    return { targetBoard, targetListId: personalListId, response: null };
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
      targetBoard: null,
      targetListId: null,
      response: NextResponse.json(
        { error: 'Personal board not found' },
        { status: 404 }
      ),
    };
  }

  return {
    targetBoard: targetBoard as TargetBoardRow,
    targetListId: null,
    response: null,
  };
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

    const { personal_board_id, personal_sort_key } = parsed.data;
    const personalListId =
      parsed.data.personal_list_id &&
      !isPersonalExternalStagingListId(parsed.data.personal_list_id)
        ? parsed.data.personal_list_id
        : null;

    const {
      targetBoard,
      targetListId: resolvedPersonalListId,
      response: targetResponse,
    } = await resolvePersonalPlacementTarget(
      sbAdmin,
      personal_board_id,
      personalListId
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
      sourceBoardId !== personal_board_id;

    if (!isWorkspaceExternalSource && !isPersonalBoardExternalSource) {
      return NextResponse.json(
        {
          error:
            'Only external workspace tasks or board-external personal tasks can be placed on a personal board',
        },
        { status: 400 }
      );
    }

    const targetMembership = await verifyWorkspaceMembershipType({
      wsId: targetWsId,
      userId: user.id,
      supabase: supabase as any,
    });

    if (targetMembership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify destination access' },
        { status: 500 }
      );
    }

    if (!targetMembership.ok) {
      return NextResponse.json(
        { error: 'Personal board not found' },
        { status: 404 }
      );
    }

    const { data: placementRows, error: saveError } = await (
      sbAdmin as any
    ).rpc('upsert_personal_task_placement', {
      p_task_id: taskId,
      p_user_id: user.id,
      p_personal_board_id: personal_board_id,
      p_personal_list_id: resolvedPersonalListId,
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
      task: buildPlacedTask(sourceTask, savedPlacement as PlacementRow),
    });
  }
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
  }
);
