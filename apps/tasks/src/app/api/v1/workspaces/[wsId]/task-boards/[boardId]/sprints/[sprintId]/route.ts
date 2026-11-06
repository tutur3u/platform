import { withSessionAuth } from '@/lib/api-auth';
import {
  requireSprintAccess,
  type SprintRouteParams,
  sprintRouteErrorResponse,
  TASK_BOARD_SPRINT_APP_SESSION_AUTH,
} from '../_lib';
import { removeBoardSprint, updateBoardSprint } from '../_operations';

export const PATCH = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'plan');
      if ('error' in access) return access.error;

      return updateBoardSprint({ access, params, request });
    } catch (error) {
      return sprintRouteErrorResponse(error, 'Error updating sprint:');
    }
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'plan');
      if ('error' in access) return access.error;

      return removeBoardSprint({ access, params, request });
    } catch (error) {
      return sprintRouteErrorResponse(error, 'Error removing sprint:');
    }
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);
