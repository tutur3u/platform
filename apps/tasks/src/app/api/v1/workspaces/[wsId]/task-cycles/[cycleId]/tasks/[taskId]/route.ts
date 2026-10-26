import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import {
  assertCycleAndTaskInWorkspace,
  resolveCycleWorkspaceAccess,
} from '../../../_cycle-task-access';

interface RouteParams {
  wsId: string;
  cycleId: string;
  taskId: string;
}

/** Returns a task from this cycle to the workspace backlog. */
export const DELETE = withSessionAuth<RouteParams>(
  async (
    _request: NextRequest,
    { supabase, user },
    { wsId, cycleId, taskId }
  ) => {
    try {
      const access = await resolveCycleWorkspaceAccess(supabase, user.id, wsId);
      if (!access.ok) return access.response;

      const invalid = await assertCycleAndTaskInWorkspace(supabase, {
        wsId: access.wsId,
        cycleId,
        taskId,
      });
      if (invalid) return invalid;

      const { error } = await supabase
        .from('task_cycle_tasks')
        .delete()
        .eq('cycle_id', cycleId)
        .eq('task_id', taskId);

      if (error) {
        console.error('Error removing task from cycle:', error);
        return NextResponse.json(
          { error: 'Failed to remove task from cycle' },
          { status: 500 }
        );
      }

      return NextResponse.json({ taskId, cycleId: null });
    } catch (error) {
      console.error(
        'Error in DELETE /api/v1/workspaces/[wsId]/task-cycles/[cycleId]/tasks/[taskId]:',
        error
      );
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: { targetApp: [CLI_APP_TARGET_APP, 'tasks'] } }
);
