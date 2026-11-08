import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  boardCyclesNotEnabledResponse,
  goalResultSchema,
  loadEnabledBoardSprints as loadBoardSprints,
  readWorkspaceBoardCyclesEnabled as areBoardCyclesEnabled,
  requireBoardSprint,
  type requireSprintAccess,
  type SprintRouteParams,
  serializeSprintReport,
  sprintIdSchema,
  sprintRouteErrorResponse,
  sprintRpcErrorResponse,
} from './_lib';

type PreparedSprintAccess = Extract<
  Awaited<ReturnType<typeof requireSprintAccess>>,
  { sbAdmin: TypedSupabaseClient }
>;

type SprintOperationContext = {
  access: PreparedSprintAccess;
  params: SprintRouteParams;
  request: Request;
};

const updateSprintLengthSchema = z.object({
  sprint_length_weeks: z.union([z.literal(1), z.literal(2), z.null()]),
});

export async function readBoardSprintState({ access }: SprintOperationContext) {
  try {
    const loaded = await loadBoardSprints(access);
    if (!loaded.ok) {
      return sprintRpcErrorResponse(loaded.error, 'Failed to load sprints');
    }

    return NextResponse.json(loaded.data);
  } catch (error) {
    return sprintRouteErrorResponse(error, 'Error loading sprints:');
  }
}

export async function updateBoardSprintLength({
  access,
  request,
}: SprintOperationContext) {
  try {
    const body = updateSprintLengthSchema.parse(await request.json());
    if (
      body.sprint_length_weeks !== null &&
      !(await areBoardCyclesEnabled(access.sbAdmin, access.wsId))
    ) {
      return boardCyclesNotEnabledResponse();
    }
    const { error } = await access.sbAdmin.rpc('set_board_sprint_length', {
      p_actor_id: access.user.id,
      p_board_id: access.boardId,
      p_weeks: body.sprint_length_weeks as number,
    });
    if (error) {
      return sprintRpcErrorResponse(error, 'Failed to update sprint length');
    }

    const loaded = await loadBoardSprints(access);
    if (!loaded.ok) {
      return sprintRpcErrorResponse(loaded.error, 'Failed to load sprints');
    }

    return NextResponse.json(loaded.data);
  } catch (error) {
    return sprintRouteErrorResponse(error, 'Error updating sprint length:');
  }
}

export async function addBoardSprint({ access }: SprintOperationContext) {
  try {
    const { data: added, error } = await access.sbAdmin.rpc(
      'add_board_sprint',
      {
        p_actor_id: access.user.id,
        p_board_id: access.boardId,
        p_ws_id: access.wsId,
      }
    );
    if (error) {
      return sprintRpcErrorResponse(error, 'Failed to add sprint');
    }

    const loaded = await loadBoardSprints(access);
    if (!loaded.ok) {
      return sprintRpcErrorResponse(loaded.error, 'Failed to load sprints');
    }

    return NextResponse.json({ ...loaded.data, addedSprintId: added?.id });
  } catch (error) {
    return sprintRouteErrorResponse(error, 'Error adding sprint:');
  }
}

const updateSprintSchema = z
  .object({
    goal: z.string().trim().max(500).nullable().optional(),
    goal_result: goalResultSchema.nullable().optional(),
  })
  .refine(
    (body) => body.goal !== undefined || body.goal_result !== undefined,
    'Nothing to update'
  );

export async function updateBoardSprint({
  access,
  params,
  request,
}: SprintOperationContext) {
  try {
    const sprintId = sprintIdSchema.parse(params.sprintId);
    const body = updateSprintSchema.parse(await request.json());
    const existing = await requireBoardSprint(
      access.sbAdmin,
      access.boardId,
      sprintId
    );
    if (existing.error) return existing.error;

    if (
      existing.sprint.status !== 'planned' &&
      existing.sprint.status !== 'active'
    ) {
      return NextResponse.json(
        { code: 'SPRINT_NOT_OPEN', error: 'SPRINT_NOT_OPEN' },
        { status: 409 }
      );
    }

    const { error } = await access.sbAdmin
      .from('task_cycles')
      .update({
        ...(body.goal !== undefined ? { goal: body.goal || null } : {}),
        ...(body.goal_result !== undefined
          ? { goal_result: body.goal_result }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sprintId)
      .eq('board_id', access.boardId);
    if (error) {
      return sprintRpcErrorResponse(error, 'Failed to update sprint');
    }

    const loaded = await loadBoardSprints(access);
    if (!loaded.ok) {
      return sprintRpcErrorResponse(loaded.error, 'Failed to load sprints');
    }

    const sprint = loaded.data.sprints.find(
      (item: BoardSprint) => item.id === sprintId
    );
    return NextResponse.json({ sprint });
  } catch (error) {
    return sprintRouteErrorResponse(error, 'Error updating sprint:');
  }
}

export async function removeBoardSprint({
  access,
  params,
}: SprintOperationContext) {
  try {
    const sprintId = sprintIdSchema.parse(params.sprintId);
    const existing = await requireBoardSprint(
      access.sbAdmin,
      access.boardId,
      sprintId
    );
    if (existing.error) return existing.error;

    const { error } = await access.sbAdmin.rpc('remove_board_sprint', {
      p_actor_id: access.user.id,
      p_board_id: access.boardId,
      p_cycle_id: sprintId,
      p_ws_id: access.wsId,
    });
    if (error) {
      return sprintRpcErrorResponse(error, 'Failed to remove sprint');
    }

    const loaded = await loadBoardSprints(access);
    if (!loaded.ok) {
      return sprintRpcErrorResponse(loaded.error, 'Failed to load sprints');
    }

    return NextResponse.json(loaded.data);
  } catch (error) {
    return sprintRouteErrorResponse(error, 'Error removing sprint:');
  }
}

export async function startBoardSprint({
  access,
  params,
}: SprintOperationContext) {
  try {
    const sprintId = sprintIdSchema.parse(params.sprintId);
    const existing = await requireBoardSprint(
      access.sbAdmin,
      access.boardId,
      sprintId
    );
    if (existing.error) return existing.error;

    const { error } = await access.sbAdmin.rpc('start_board_sprint', {
      p_actor_id: access.user.id,
      p_cycle_id: sprintId,
    });
    if (error) {
      return sprintRpcErrorResponse(error, 'Failed to start sprint');
    }

    const loaded = await loadBoardSprints(access);
    if (!loaded.ok) {
      return sprintRpcErrorResponse(loaded.error, 'Failed to load sprints');
    }

    return NextResponse.json(loaded.data);
  } catch (error) {
    return sprintRouteErrorResponse(error, 'Error starting sprint:');
  }
}

const endSprintSchema = z.object({
  decisions: z
    .record(z.guid(), z.enum(['carry', 'backlog']))
    .optional()
    .default({}),
  goal_result: goalResultSchema.nullable().optional(),
});

export async function endBoardSprint({
  access,
  params,
  request,
}: SprintOperationContext) {
  try {
    const sprintId = sprintIdSchema.parse(params.sprintId);
    const body = endSprintSchema.parse(await request.json());
    const existing = await requireBoardSprint(
      access.sbAdmin,
      access.boardId,
      sprintId
    );
    if (existing.error) return existing.error;

    const { data: report, error } = await access.sbAdmin.rpc(
      'end_board_sprint',
      {
        p_actor_id: access.user.id,
        p_cycle_id: sprintId,
        p_decisions: body.decisions,
        p_goal_result: body.goal_result ?? undefined,
      }
    );
    if (error) {
      return sprintRpcErrorResponse(error, 'Failed to end sprint');
    }

    const loaded = await loadBoardSprints(access);
    if (!loaded.ok) {
      return sprintRpcErrorResponse(loaded.error, 'Failed to load sprints');
    }

    return NextResponse.json({
      ...loaded.data,
      report: serializeSprintReport(
        (Array.isArray(report) ? report[0] : report) as Parameters<
          typeof serializeSprintReport
        >[0]
      ),
    });
  } catch (error) {
    return sprintRouteErrorResponse(error, 'Error ending sprint:');
  }
}

const moveTasksSchema = z.object({
  task_ids: z.array(z.guid()).min(1).max(500),
});

export async function moveBoardSprintTasks({
  access,
  params,
  request,
}: SprintOperationContext) {
  try {
    const sprintId = sprintIdSchema.parse(params.sprintId);
    const body = moveTasksSchema.parse(await request.json());
    const { data, error } = await access.sbAdmin.rpc(
      'move_tasks_to_board_sprint',
      {
        p_board_id: access.boardId,
        p_cycle_id: sprintId,
        p_task_ids: [...new Set(body.task_ids)],
      }
    );
    if (error) {
      return sprintRpcErrorResponse(error, 'Failed to move tasks');
    }

    return NextResponse.json({ moved: Number(data ?? 0) });
  } catch (error) {
    return sprintRouteErrorResponse(error, 'Error moving tasks to sprint:');
  }
}

const unplanTasksSchema = z.object({
  task_ids: z.array(z.guid()).min(1).max(500),
});

export async function unplanBoardSprintTasks({
  access,
  request,
}: SprintOperationContext) {
  try {
    const body = unplanTasksSchema.parse(await request.json());
    const { data, error } = await access.sbAdmin.rpc(
      'move_tasks_to_board_sprint',
      {
        p_board_id: access.boardId,
        p_task_ids: [...new Set(body.task_ids)],
      }
    );
    if (error) {
      return sprintRpcErrorResponse(error, 'Failed to move tasks');
    }

    return NextResponse.json({ moved: Number(data ?? 0) });
  } catch (error) {
    return sprintRouteErrorResponse(
      error,
      'Error moving tasks out of sprints:'
    );
  }
}
