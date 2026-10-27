import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  loadBoardSprints,
  requireBoardSprint,
  requireSprintAccess,
  type SprintRouteParams,
  sprintIdSchema,
  sprintRouteErrorResponse,
  sprintRpcErrorResponse,
  TASK_BOARD_SPRINT_APP_SESSION_AUTH,
} from '../../_lib';

export const POST = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'manage');
      if ('error' in access) return access.error;

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

      const loaded = await loadBoardSprints(access.sbAdmin, access.boardId);
      if (!loaded.ok) {
        return sprintRpcErrorResponse(loaded.error, 'Failed to load sprints');
      }

      return NextResponse.json(loaded.data);
    } catch (error) {
      return sprintRouteErrorResponse(error, 'Error starting sprint:');
    }
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);
