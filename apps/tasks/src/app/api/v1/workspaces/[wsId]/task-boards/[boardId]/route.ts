import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import {
  handleBoardRouteDELETE,
  handleBoardRoutePUT,
} from '@tuturuuu/tasks-api/server/board/boardId/route';
import { withSessionAuth } from '@/lib/api-auth';
import { readTaskBoardDetail } from './board-detail';

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
  (_request, auth, params) => readTaskBoardDetail(params, auth),
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
