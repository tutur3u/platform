import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import {
  OPEN_TASK_LIST_STATUSES,
  resolveCycleWorkspaceAccess,
} from '../_cycle-task-access';

interface RouteParams {
  wsId: string;
}

const MAX_BACKLOG_LIMIT = 200;

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_BACKLOG_LIMIT).optional(),
});

/** Lists the workspace backlog: open tasks that are in no cycle. */
export const GET = withSessionAuth<RouteParams>(
  async (request: NextRequest, { supabase, user }, { wsId }) => {
    try {
      const access = await resolveCycleWorkspaceAccess(supabase, user.id, wsId);
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

      const { data, error } = await supabase
        .from('tasks')
        .select(
          `
          id,
          name,
          priority,
          end_date,
          estimation_points,
          created_at,
          list:task_lists!inner(
            id,
            name,
            status,
            board:workspace_boards!inner(id, name, ws_id)
          ),
          task_cycle_tasks!left(cycle_id)
        `
        )
        .eq('list.board.ws_id', access.wsId)
        .is('list.board.deleted_at', null)
        .is('list.board.archived_at', null)
        .in('list.status', [...OPEN_TASK_LIST_STATUSES])
        .not('list.deleted', 'is', true)
        .not('list.archived', 'is', true)
        .is('deleted_at', null)
        .is('task_cycle_tasks', null)
        .order('created_at', { ascending: false })
        .limit(parsed.data.limit ?? MAX_BACKLOG_LIMIT);

      if (error) {
        console.error('Error fetching task backlog:', error);
        return NextResponse.json(
          { error: 'Failed to fetch backlog' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        tasks: (data ?? []).map(({ task_cycle_tasks: _links, ...task }) => task),
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
