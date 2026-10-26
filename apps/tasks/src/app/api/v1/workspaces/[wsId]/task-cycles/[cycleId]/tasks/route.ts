import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  cyclePlanningTaskSelect,
  type RawPlanningTask,
  toCyclePlanningTask,
} from '../../_cycle-planning-task';
import {
  assertCycleInWorkspace,
  assertTaskInWorkspace,
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

      const { data, error } = await sbAdmin
        .from('tasks')
        .select(cyclePlanningTaskSelect('inner'))
        .eq('cycle_links.cycle_id', cycleId)
        .eq('list.board.ws_id', access.wsId)
        .in('list.status', [...CYCLE_PLANNABLE_LIST_STATUSES])
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(MAX_CYCLE_TASKS);

      if (error) return failed('Failed to fetch cycle tasks', error);

      return NextResponse.json({
        tasks: ((data ?? []) as unknown as RawPlanningTask[]).map(
          toCyclePlanningTask
        ),
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

      const { error } = await sbAdmin
        .from('task_cycle_tasks')
        .upsert(
          { task_id: body.taskId, cycle_id: cycleId },
          { onConflict: 'task_id' }
        );

      if (error) return failed('Failed to assign task to cycle', error);

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
