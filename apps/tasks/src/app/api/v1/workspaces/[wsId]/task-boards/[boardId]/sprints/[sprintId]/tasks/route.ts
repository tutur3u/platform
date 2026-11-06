import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  requireSprintAccess,
  type SprintRouteParams,
  sprintIdSchema,
  sprintRouteErrorResponse,
  sprintRpcErrorResponse,
  TASK_BOARD_SPRINT_APP_SESSION_AUTH,
} from '../../_lib';

const moveTasksSchema = z.object({
  task_ids: z.array(z.guid()).min(1).max(500),
});

export const POST = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'plan');
      if ('error' in access) return access.error;

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
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);
