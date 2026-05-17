import {
  handleTaskDetailRouteDELETE,
  handleTaskDetailRouteGET,
  handleTaskDetailRoutePATCH,
  handleTaskDetailRoutePUT,
} from '@tuturuuu/apis/tu-do/tasks/taskId/route';
import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import {
  CLI_APP_ACCESS_SCOPE,
  CLI_APP_TARGET_APP,
} from '@tuturuuu/auth/cli-session';
import { withSessionAuth } from '@/lib/api-auth';

type Params = { wsId: string; taskId: string };

const CLI_APP_SESSION_AUTH = {
  requiredScope: CLI_APP_ACCESS_SCOPE,
  targetApp: CLI_APP_TARGET_APP,
} as const;

function createTaskDetailRouteContext(params: Params) {
  return { params: Promise.resolve(params) };
}

function isAppSessionRequest(request: Request) {
  return Boolean(getAppSessionTokenFromRequest(request));
}

export const GET = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskDetailRouteGET(request, createTaskDetailRouteContext(params), {
      appSession: isAppSessionRequest(request),
      supabase,
      user,
    }),
  { allowAppSessionAuth: CLI_APP_SESSION_AUTH }
);

export const PUT = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskDetailRoutePUT(request, createTaskDetailRouteContext(params), {
      appSession: isAppSessionRequest(request),
      supabase,
      user,
    }),
  { allowAppSessionAuth: CLI_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskDetailRouteDELETE(request, createTaskDetailRouteContext(params), {
      appSession: isAppSessionRequest(request),
      supabase,
      user,
    }),
  { allowAppSessionAuth: CLI_APP_SESSION_AUTH }
);

export const PATCH = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskDetailRoutePATCH(request, createTaskDetailRouteContext(params), {
      appSession: isAppSessionRequest(request),
      supabase,
      user,
    }),
  { allowAppSessionAuth: CLI_APP_SESSION_AUTH }
);
