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
} from '../_cycle-planning-task';
import {
  MAX_CYCLE_TASKS,
  OPEN_TASK_LIST_STATUSES,
  resolveCycleWorkspaceAccess,
} from '../_cycle-task-access';

interface RouteParams {
  wsId: string;
}

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_CYCLE_TASKS).optional(),
});

/** Lists the workspace backlog: open tasks that are in no cycle. */
export const GET = withSessionAuth<RouteParams>(
  async (request: NextRequest, { supabase, user }, { wsId }) => {
    try {
      const access = await resolveCycleWorkspaceAccess(supabase, user, wsId);
      if (!access.ok) return access.response;

      const parsed = querySchema.safeParse({
        limit: request.nextUrl.searchParams.get('limit') ?? undefined,
      });
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.message || 'Invalid query' },
          { status: 400 }
        );
      }

      const sbAdmin = await createAdminClient();
      const { data, error } = await sbAdmin
        .from('tasks')
        .select(cyclePlanningTaskSelect('left'))
        .eq('list.board.ws_id', access.wsId)
        .is('list.board.deleted_at', null)
        .is('list.board.archived_at', null)
        .in('list.status', [...OPEN_TASK_LIST_STATUSES])
        .not('list.deleted', 'is', true)
        .not('list.archived', 'is', true)
        .is('deleted_at', null)
        .is('cycle_links', null)
        .order('created_at', { ascending: false })
        .limit(parsed.data.limit ?? MAX_CYCLE_TASKS);

      if (error) {
        console.error('Error fetching task backlog:', error);
        return NextResponse.json(
          { error: 'Failed to fetch backlog' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        tasks: ((data ?? []) as unknown as RawPlanningTask[]).map(
          toCyclePlanningTask
        ),
      });
    } catch (error) {
      console.error(
        'Error in GET /api/v1/workspaces/[wsId]/task-cycles/backlog:',
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
