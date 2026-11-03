import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  cyclePlanningTaskSelect,
  isCurrentlyInCycle,
  type RawPlanningTask,
  toCyclePlanningTask,
} from '../../_cycle-planning-task';
import {
  assertCycleInWorkspace,
  assertTaskInWorkspace,
  boardSprintRefused,
  CYCLE_PLANNABLE_LIST_STATUSES,
  MAX_CYCLE_TASKS,
  resolveCycleWorkspaceAccess,
} from '../../_cycle-task-access';

interface RouteParams {
  wsId: string;
  cycleId: string;
}

const APP_SESSION_AUTH = {
  allowAppSessionAuth: { targetApp: [CLI_APP_TARGET_APP, 'tasks'] },
} as const;

const taskBodySchema = z.object({
  taskId: z.guid('Task id must be a valid UUID'),
});

async function parseTaskBody(request: NextRequest) {
  const parsed = taskBodySchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: parsed.error.message || 'Invalid input' },
        { status: 400 }
      ),
    };
  }
  return { taskId: parsed.data.taskId };
}

function failed(message: string, error: unknown) {
  console.error(
    `Error in /api/v1/workspaces/[wsId]/task-cycles/[cycleId]/tasks: ${message}`,
    error
  );
  return NextResponse.json({ error: message }, { status: 500 });
}

// The message assign_task_cycle (and the workspace guard trigger) raise with
// 42501. Any other 42501, such as a missing EXECUTE grant after a bad deploy
// or rollback, is a server fault, not a missing task.
const WORKSPACE_MISMATCH_MESSAGE =
  'Task and cycle must belong to the same workspace';

/** Maps assign_task_cycle SQLSTATEs to responses (see its migration). */
function assignFailed(error: { code?: string; message?: string }) {
  // 42501 cross-workspace, P0002 task or cycle gone or deleted: all were
  // checked above, so they only happen when a row changed in between.
  if (
    (error.code === '42501' && error.message === WORKSPACE_MISMATCH_MESSAGE) ||
    error.code === 'P0002'
  ) {
    return NextResponse.json(
      { error: 'Task or cycle not found' },
      { status: 404 }
    );
  }
  // 22023: the cycle is a board sprint (checked above as well).
  if (error.code === '22023') return boardSprintRefused();
  // 55P03 lock_not_available: another assign of this task held its row lock.
  // 40P01 deadlock_detected: the transaction was rolled back; retrying is safe.
  if (error.code === '55P03' || error.code === '40P01') {
    return NextResponse.json(
      { error: 'Task is being moved by another request; retry' },
      { status: 409 }
    );
  }
  return failed('Failed to assign task to cycle', error);
}

/** Lists the tasks in this cycle as planning rows. */
export const GET = withSessionAuth<RouteParams>(
  async (_request: NextRequest, { supabase, user }, { wsId, cycleId }) => {
    try {
      const access = await resolveCycleWorkspaceAccess(supabase, user, wsId);
      if (!access.ok) return access.response;

      const sbAdmin = await createAdminClient();
      const invalid = await assertCycleInWorkspace(
        sbAdmin,
        access.wsId,
        cycleId
      );
      if (invalid) return invalid;

      // in_cycle narrows the fetch to tasks linked to this cycle; cycle_links
      // keeps only links to live workspace cycles, so board-sprint history
      // rows and deleted cycles never decide where a task is listed.
      const { data, error } = await sbAdmin
        .from('tasks')
        .select(cyclePlanningTaskSelect('cycle'))
        .eq('in_cycle.cycle_id', cycleId)
        .is('cycle_links.cycle.board_id', null)
        .not('cycle_links.cycle.deleted', 'is', true)
        .eq('list.board.ws_id', access.wsId)
        .in('list.status', [...CYCLE_PLANNABLE_LIST_STATUSES])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(MAX_CYCLE_TASKS);

      if (error) return failed('Failed to fetch cycle tasks', error);

      // A task with older duplicate links is listed only in its newest cycle.
      return NextResponse.json({
        tasks: ((data ?? []) as unknown as RawPlanningTask[])
          .filter((task) => isCurrentlyInCycle(task, cycleId))
          .map(toCyclePlanningTask),
      });
    } catch (error) {
      return failed('Internal server error', error);
    }
  },
  APP_SESSION_AUTH
);

/** Puts a task into this cycle, moving it out of any other cycle. */
export const POST = withSessionAuth<RouteParams>(
  async (request: NextRequest, { supabase, user }, { wsId, cycleId }) => {
    try {
      const access = await resolveCycleWorkspaceAccess(supabase, user, wsId, {
        write: true,
      });
      if (!access.ok) return access.response;

      const body = await parseTaskBody(request);
      if (body.response) return body.response;

      const sbAdmin = await createAdminClient();
      const invalid =
        (await assertCycleInWorkspace(sbAdmin, access.wsId, cycleId)) ??
        (await assertTaskInWorkspace(sbAdmin, access.wsId, body.taskId));
      if (invalid) return invalid;

      // One transaction: lock the task, check the cycle and both workspaces,
      // replace its workspace-cycle links. Board-sprint rows are untouched.
      const { error } = await sbAdmin.rpc('assign_task_cycle', {
        p_task_id: body.taskId,
        p_cycle_id: cycleId,
      });

      if (error) return assignFailed(error);

      return NextResponse.json({ taskId: body.taskId, cycleId });
    } catch (error) {
      return failed('Internal server error', error);
    }
  },
  APP_SESSION_AUTH
);

/** Returns a task from this cycle to the workspace backlog. */
export const DELETE = withSessionAuth<RouteParams>(
  async (request: NextRequest, { supabase, user }, { wsId, cycleId }) => {
    try {
      const access = await resolveCycleWorkspaceAccess(supabase, user, wsId, {
        write: true,
      });
      if (!access.ok) return access.response;

      const body = await parseTaskBody(request);
      if (body.response) return body.response;

      const sbAdmin = await createAdminClient();
      const invalid = await assertCycleInWorkspace(
        sbAdmin,
        access.wsId,
        cycleId
      );
      if (invalid) return invalid;

      const { error } = await sbAdmin
        .from('task_cycle_tasks')
        .delete()
        .eq('cycle_id', cycleId)
        .eq('task_id', body.taskId);

      if (error) return failed('Failed to remove task from cycle', error);

      return NextResponse.json({ taskId: body.taskId, cycleId: null });
    } catch (error) {
      return failed('Internal server error', error);
    }
  },
  APP_SESSION_AUTH
);
