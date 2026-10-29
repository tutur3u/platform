import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  goalResultSchema,
  loadBoardSprints,
  requireBoardSprint,
  requireSprintAccess,
  type SprintRouteParams,
  sprintIdSchema,
  sprintRouteErrorResponse,
  sprintRpcErrorResponse,
  TASK_BOARD_SPRINT_APP_SESSION_AUTH,
} from '../_lib';

const updateSprintSchema = z
  .object({
    goal: z.string().trim().max(500).nullable().optional(),
    goal_result: goalResultSchema.nullable().optional(),
  })
  .refine(
    (body) => body.goal !== undefined || body.goal_result !== undefined,
    'Nothing to update'
  );

export const PATCH = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'plan');
      if ('error' in access) return access.error;

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

      const loaded = await loadBoardSprints(access.sbAdmin, access.boardId);
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
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);

// Removes the last planned sprint; its tasks move to the sprint before it.
export const DELETE = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'plan');
      if ('error' in access) return access.error;

      const sprintId = sprintIdSchema.parse(params.sprintId);
      const existing = await requireBoardSprint(
        access.sbAdmin,
        access.boardId,
        sprintId
      );
      if (existing.error) return existing.error;

      const { error } = await access.sbAdmin.rpc('remove_board_sprint', {
        p_actor_id: access.user.id,
        p_cycle_id: sprintId,
      });
      if (error) {
        return sprintRpcErrorResponse(error, 'Failed to remove sprint');
      }

      const loaded = await loadBoardSprints(access.sbAdmin, access.boardId);
      if (!loaded.ok) {
        return sprintRpcErrorResponse(loaded.error, 'Failed to load sprints');
      }

      return NextResponse.json(loaded.data);
    } catch (error) {
      return sprintRouteErrorResponse(error, 'Error removing sprint:');
    }
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);
