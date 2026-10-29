import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  loadBoardSprints,
  requireSprintAccess,
  type SprintRouteParams,
  sprintRouteErrorResponse,
  sprintRpcErrorResponse,
  TASK_BOARD_SPRINT_APP_SESSION_AUTH,
} from './_lib';

const updateSprintLengthSchema = z.object({
  sprint_length_weeks: z.union([z.literal(1), z.literal(2), z.null()]),
});

export const GET = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'view');
      if ('error' in access) return access.error;

      const loaded = await loadBoardSprints(access.sbAdmin, access.boardId);
      if (!loaded.ok) {
        return sprintRpcErrorResponse(loaded.error, 'Failed to load sprints');
      }

      return NextResponse.json(loaded.data);
    } catch (error) {
      return sprintRouteErrorResponse(error, 'Error loading sprints:');
    }
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);

export const PUT = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'manage');
      if ('error' in access) return access.error;

      const body = updateSprintLengthSchema.parse(await request.json());
      const { error } = await access.sbAdmin.rpc('set_board_sprint_length', {
        p_actor_id: access.user.id,
        p_board_id: access.boardId,
        p_weeks: body.sprint_length_weeks as number,
      });
      if (error) {
        return sprintRpcErrorResponse(error, 'Failed to update sprint length');
      }

      const loaded = await loadBoardSprints(access.sbAdmin, access.boardId);
      if (!loaded.ok) {
        return sprintRpcErrorResponse(loaded.error, 'Failed to load sprints');
      }

      return NextResponse.json(loaded.data);
    } catch (error) {
      return sprintRouteErrorResponse(error, 'Error updating sprint length:');
    }
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);

// Plans one more sprint after the last open one (up to five open sprints).
export const POST = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'plan');
      if ('error' in access) return access.error;

      const { error } = await access.sbAdmin.rpc('add_board_sprint', {
        p_actor_id: access.user.id,
        p_board_id: access.boardId,
      });
      if (error) {
        return sprintRpcErrorResponse(error, 'Failed to add sprint');
      }

      const loaded = await loadBoardSprints(access.sbAdmin, access.boardId);
      if (!loaded.ok) {
        return sprintRpcErrorResponse(loaded.error, 'Failed to load sprints');
      }

      return NextResponse.json(loaded.data);
    } catch (error) {
      return sprintRouteErrorResponse(error, 'Error adding sprint:');
    }
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);
