import { withSessionAuth } from '@/lib/api-auth';
import {
  boardSprintReadReleaseResponse,
  requireSprintAccess,
  type SprintRouteParams,
  sprintRouteErrorResponse,
  TASK_BOARD_SPRINT_APP_SESSION_AUTH,
} from './_lib';
import {
  addBoardSprint,
  readBoardSprintState,
  updateBoardSprintLength,
} from './_operations';

export const GET = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'view');
      if ('error' in access) return access.error;

      const unavailable = boardSprintReadReleaseResponse();
      if (unavailable) return unavailable;

      return readBoardSprintState({ access, params, request });
    } catch (error) {
      return sprintRouteErrorResponse(error, 'Error loading sprints:');
    }
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);

export const PUT = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(
        request,
        params,
        auth,
        'manage',
        { allowWhenNotEnabled: true }
      );
      if ('error' in access) return access.error;

      return updateBoardSprintLength({ access, params, request });
    } catch (error) {
      return sprintRouteErrorResponse(error, 'Error updating sprint length:');
    }
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);

export const POST = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'create');
      if ('error' in access) return access.error;

      return addBoardSprint({ access, params, request });
    } catch (error) {
      return sprintRouteErrorResponse(error, 'Error adding sprint:');
    }
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);
