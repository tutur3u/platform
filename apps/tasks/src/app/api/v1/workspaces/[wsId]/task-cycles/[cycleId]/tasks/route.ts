import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  assertCycleAndTaskInWorkspace,
  resolveCycleWorkspaceAccess,
} from '../../_cycle-task-access';

interface RouteParams {
  wsId: string;
  cycleId: string;
}

const assignTaskSchema = z.object({
  taskId: z.guid('Task id must be a valid UUID'),
});

/** Puts a task into this cycle, moving it out of any other cycle. */
export const POST = withSessionAuth<RouteParams>(
  async (request: NextRequest, { supabase, user }, { wsId, cycleId }) => {
    try {
      const access = await resolveCycleWorkspaceAccess(supabase, user.id, wsId);
      if (!access.ok) return access.response;

      const parsed = assignTaskSchema.safeParse(
        await request.json().catch(() => null)
      );
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.message || 'Invalid input' },
          { status: 400 }
        );
      }
      const { taskId } = parsed.data;

      const invalid = await assertCycleAndTaskInWorkspace(supabase, {
        wsId: access.wsId,
        cycleId,
        taskId,
      });
      if (invalid) return invalid;

      const { error } = await supabase
        .from('task_cycle_tasks')
        .upsert(
          { task_id: taskId, cycle_id: cycleId },
          { onConflict: 'task_id' }
        );

      if (error) {
        console.error('Error assigning task to cycle:', error);
        return NextResponse.json(
          { error: 'Failed to assign task to cycle' },
          { status: 500 }
        );
      }

      return NextResponse.json({ taskId, cycleId });
    } catch (error) {
      console.error(
        'Error in POST /api/v1/workspaces/[wsId]/task-cycles/[cycleId]/tasks:',
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
