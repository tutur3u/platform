import {
  handleBoardRouteDELETE,
  handleBoardRoutePUT,
} from '@tuturuuu/apis/tu-do/board/boardId/route';
import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { requireBoardAccess } from './lists/access';

const paramsSchema = z.object({
  wsId: z.string().min(1),
  boardId: z.guid(),
});

type Params = { wsId: string; boardId: string };

const TASK_BOARD_ROUTE_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'calendar', 'tasks'],
} as const;

// Board columns selected for the board detail view. Optional columns are added
// incrementally so a stale production schema cache cannot take the board page
// down while a rollout is settling.
const BOARD_BASE_COLUMNS = [
  'id',
  'ws_id',
  'name',
  'icon',
  'ticket_prefix',
  'created_at',
  'archived_at',
  'deleted_at',
] as const;

const BOARD_OPTIONAL_COLUMN_DEFAULTS = {
  default_list_id: null,
  default_done_list_id: null,
  default_closed_list_id: null,
  estimation_type: null,
  extended_estimation: false,
  allow_zero_estimates: true,
  count_unestimated_issues: false,
} as const;

type BoardOptionalColumn = keyof typeof BOARD_OPTIONAL_COLUMN_DEFAULTS;

const BOARD_OPTIONAL_COLUMNS = Object.keys(
  BOARD_OPTIONAL_COLUMN_DEFAULTS
) as BoardOptionalColumn[];

const BOARD_TASK_LISTS_SELECT =
  'task_lists(id, board_id, name, status, color, position, archived, deleted, created_at, creator_id)';

type BoardQueryError = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

type BoardTaskListRow = {
  board_id: string | null;
  color: string | null;
  created_at: string | null;
  creator_id: string | null;
  deleted: boolean | null;
  archived: boolean | null;
  id: string;
  name: string | null;
  position: number | null;
  status: string | null;
};

type BoardDetailRow = {
  allow_zero_estimates?: boolean | null;
  archived_at: string | null;
  count_unestimated_issues?: boolean | null;
  created_at: string | null;
  default_closed_list_id?: string | null;
  default_done_list_id?: string | null;
  default_list_id?: string | null;
  deleted_at: string | null;
  estimation_type?: string | null;
  extended_estimation?: boolean | null;
  icon: string | null;
  id: string;
  name: string | null;
  task_lists?: BoardTaskListRow[] | null;
  ticket_prefix: string | null;
  ws_id: string;
};

type NormalizedBoardDetailRow = BoardDetailRow &
  Required<Pick<BoardDetailRow, BoardOptionalColumn>>;

type BoardQueryResult = {
  data: NormalizedBoardDetailRow | null;
  error: BoardQueryError | null;
};

async function boardHasGuestAccess({
  boardId,
  sbAdmin,
}: {
  boardId: string;
  sbAdmin: TypedSupabaseClient;
}) {
  const { count, error } = await sbAdmin
    .from('task_board_shares')
    .select('id', { count: 'exact', head: true })
    .eq('board_id', boardId);

  if (error) {
    console.warn('Failed to load task board guest share count', {
      boardId,
      error,
    });
    return false;
  }

  return (count ?? 0) > 0;
}

function buildBoardSelect(columns: Iterable<BoardOptionalColumn>) {
  return [...BOARD_BASE_COLUMNS, ...columns, BOARD_TASK_LISTS_SELECT].join(
    ', '
  );
}

function getMissingOptionalBoardColumn(error: BoardQueryError) {
  const errorText = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join('\n');

  if (error.code !== '42703' && error.code !== 'PGRST204') {
    return BOARD_OPTIONAL_COLUMNS.find((column) => errorText.includes(column));
  }

  return BOARD_OPTIONAL_COLUMNS.find((column) => errorText.includes(column));
}

async function loadBoardWithRolloutFallback({
  boardId,
  sbAdmin,
}: {
  boardId: string;
  sbAdmin: TypedSupabaseClient;
}): Promise<BoardQueryResult> {
  const selectedOptionalColumns = new Set(BOARD_OPTIONAL_COLUMNS);

  for (
    let attempt = 0;
    attempt <= BOARD_OPTIONAL_COLUMNS.length;
    attempt += 1
  ) {
    const result = await sbAdmin
      .from('workspace_boards')
      .select(buildBoardSelect(selectedOptionalColumns))
      .eq('id', boardId)
      .maybeSingle();

    if (!result.error) {
      const data = result.data as BoardDetailRow | null;
      return {
        data: data
          ? {
              ...BOARD_OPTIONAL_COLUMN_DEFAULTS,
              ...data,
            }
          : null,
        error: null,
      };
    }

    const error = result.error as BoardQueryError;
    const missingColumn = getMissingOptionalBoardColumn(error);
    if (!missingColumn || !selectedOptionalColumns.delete(missingColumn)) {
      return {
        data: null,
        error,
      };
    }
  }

  return {
    data: null,
    error: { message: 'Failed to load task board' },
  };
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

      const { data: board, error } = await loadBoardWithRolloutFallback({
        boardId,
        sbAdmin,
      });

      if (error) {
        return NextResponse.json(
          { error: 'Failed to load task board' },
          { status: 500 }
        );
      }

      if (!board) {
        return NextResponse.json({ error: 'Board not found' }, { status: 404 });
      }

      const hasGuestAccess =
        access.access.mode === 'guest' ||
        (await boardHasGuestAccess({ boardId, sbAdmin }));

      const normalizedBoard = {
        ...board,
        default_list_id: board.default_list_id ?? null,
        default_done_list_id: board.default_done_list_id ?? null,
        default_closed_list_id: board.default_closed_list_id ?? null,
        access_type: access.access.mode,
        guest_permission:
          access.access.mode === 'guest' ? access.access.permission : null,
        has_guest_access: hasGuestAccess,
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

      console.error('Error fetching task board:', error);
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
