import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  goalResultSchema,
  loadBoardSprints,
  requireBoardSprint,
  requireSprintAccess,
  type SprintRouteParams,
  serializeSprintReport,
  sprintIdSchema,
  sprintRouteErrorResponse,
  sprintRpcErrorResponse,
  TASK_BOARD_SPRINT_APP_SESSION_AUTH,
} from '../../_lib';

const endSprintSchema = z.object({
  decisions: z
    .record(z.guid(), z.enum(['carry', 'backlog']))
    .optional()
    .default({}),
  goal_result: goalResultSchema.nullable().optional(),
});

export const POST = withSessionAuth<SprintRouteParams>(
  async (request, auth, params) => {
    try {
      const access = await requireSprintAccess(request, params, auth, 'manage');
      if ('error' in access) return access.error;

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

      const loaded = await loadBoardSprints(access.sbAdmin, access.boardId);
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
  },
  { allowAppSessionAuth: TASK_BOARD_SPRINT_APP_SESSION_AUTH }
);
