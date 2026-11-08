import { withSessionAuth } from '@/lib/api-auth';
import {
  requireSprintAccess,
  type SprintRouteParams,
  sprintRouteErrorResponse,
  TASK_BOARD_SPRINT_APP_SESSION_AUTH,
} from '../_lib';
import { unplanBoardSprintTasks } from '../_operations';

export const POST = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'plan');
      if ('error' in access) return access.error;

      return unplanBoardSprintTasks({ access, params, request });
    } catch (error) {
      return sprintRouteErrorResponse(
        error,
        'Error moving tasks out of sprints:'
      );
    }
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);
