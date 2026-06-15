import {
  handleBoardRouteDELETE,
  handleBoardRoutePUT,
} from '@tuturuuu/apis/tu-do/board/boardId/route';
import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireBoardAccess } from './lists/access';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.guid(),
});

type Params = { wsId: string; boardId: string };

const TASK_BOARD_ROUTE_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'calendar', 'tasks'],
} as const;

function createTaskBoardRouteContext(params: Params) {
  return { params: Promise.resolve(params) };
}

function isAppSessionRequest(request: Request) {
  return Boolean(getAppSessionTokenFromRequest(request));
}

export const GET = withSessionAuth<Params>(
  async (request, auth, params) => {
    try {
      const parsedParams = paramsSchema.parse(params);
      const access = await requireBoardAccess(request, parsedParams, auth);
      if ('error' in access) return access.error;

      const { boardId, sbAdmin } = access;

      const { data: board, error } = await sbAdmin
        .from('workspace_boards')
        .select(
          'id, ws_id, name, icon, ticket_prefix, default_list_id, created_at, archived_at, deleted_at, estimation_type, extended_estimation, allow_zero_estimates, count_unestimated_issues, task_lists(id, board_id, name, status, color, position, archived, deleted, created_at, creator_id)'
        )
        .eq('id', boardId)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { error: 'Failed to load task board' },
          { status: 500 }
        );
      }

      if (!board) {
        return NextResponse.json({ error: 'Board not found' }, { status: 404 });
      }

      const normalizedBoard = {
        ...board,
        access_type: access.access.mode,
        guest_permission:
          access.access.mode === 'guest' ? access.access.permission : null,
        task_lists: (board.task_lists ?? []).sort((a, b) => {
          const positionDelta = (a.position ?? 0) - (b.position ?? 0);
          if (positionDelta !== 0) return positionDelta;
          return (
            new Date(a.created_at ?? 0).getTime() -
            new Date(b.created_at ?? 0).getTime()
          );
        }),
      };

      return NextResponse.json({ board: normalizedBoard });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid workspace or board ID' },
          { status: 400 }
        );
      }

      serverLogger.error('Error fetching task board:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  },
  { allowAppSessionAuth: TASK_BOARD_ROUTE_APP_SESSION_AUTH }
);

export const PUT = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleBoardRoutePUT(request, createTaskBoardRouteContext(params), {
      appSession: isAppSessionRequest(request),
      supabase,
      user,
    }),
  { allowAppSessionAuth: TASK_BOARD_ROUTE_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleBoardRouteDELETE(request, createTaskBoardRouteContext(params), {
      appSession: isAppSessionRequest(request),
      supabase,
      user,
    }),
  { allowAppSessionAuth: TASK_BOARD_ROUTE_APP_SESSION_AUTH }
);
