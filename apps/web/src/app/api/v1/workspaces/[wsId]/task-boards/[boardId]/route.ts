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

// Board columns selected for the board detail view. `default_list_id` is split
// into a separate (literal) select so we can degrade gracefully when the column
// has not been migrated yet (rollout-safe: code may deploy before the migration
// runs in an environment). Both must stay string literals for Supabase type
// inference.
const BOARD_SELECT_WITH_DEFAULT_LIST =
  'id, ws_id, name, icon, ticket_prefix, default_list_id, created_at, archived_at, deleted_at, estimation_type, extended_estimation, allow_zero_estimates, count_unestimated_issues, task_lists(id, board_id, name, status, color, position, archived, deleted, created_at, creator_id)';
const BOARD_SELECT_WITHOUT_DEFAULT_LIST =
  'id, ws_id, name, icon, ticket_prefix, created_at, archived_at, deleted_at, estimation_type, extended_estimation, allow_zero_estimates, count_unestimated_issues, task_lists(id, board_id, name, status, color, position, archived, deleted, created_at, creator_id)';

/**
 * True when a Postgres/PostgREST error indicates a referenced column does not
 * exist (undefined_column, code 42703), e.g. when `default_list_id` has not
 * been migrated in the target database yet.
 */
function isUndefinedColumnError(error: { code?: string; message?: string }) {
  return (
    error.code === '42703' ||
    (typeof error.message === 'string' &&
      error.message.includes('default_list_id'))
  );
}

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

      const primary = await sbAdmin
        .from('workspace_boards')
        .select(BOARD_SELECT_WITH_DEFAULT_LIST)
        .eq('id', boardId)
        .maybeSingle();

      let board:
        | (typeof primary.data & { default_list_id?: string | null })
        | null = primary.data;
      let error = primary.error;

      // Rollout safety: if the new `default_list_id` column is not present yet
      // (migration not applied in this environment), fall back to the base
      // select so boards still load. The value is treated as unset.
      if (error && isUndefinedColumnError(error)) {
        const fallback = await sbAdmin
          .from('workspace_boards')
          .select(BOARD_SELECT_WITHOUT_DEFAULT_LIST)
          .eq('id', boardId)
          .maybeSingle();
        error = fallback.error;
        board = fallback.data
          ? { ...fallback.data, default_list_id: null }
          : null;
      }

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
        default_list_id: board.default_list_id ?? null,
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
