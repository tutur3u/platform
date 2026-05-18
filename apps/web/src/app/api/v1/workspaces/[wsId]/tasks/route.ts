import {
  handleTaskRouteGET,
  handleTaskRoutePOST,
} from '@tuturuuu/apis/tu-do/tasks/route';
import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { withSessionAuth } from '@/lib/api-auth';

type Params = { wsId: string };

const TASKS_ROUTE_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

function createTaskRouteContext(params: Params) {
  return { params: Promise.resolve(params) };
}

function isAppSessionRequest(request: Request) {
  return Boolean(getAppSessionTokenFromRequest(request));
}

export const GET = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskRouteGET(request, createTaskRouteContext(params), {
      appSession: isAppSessionRequest(request),
      supabase,
      user,
    }),
  { allowAppSessionAuth: TASKS_ROUTE_APP_SESSION_AUTH }
);

export const POST = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskRoutePOST(request, createTaskRouteContext(params), {
      appSession: isAppSessionRequest(request),
      supabase,
      user,
    }),
  { allowAppSessionAuth: TASKS_ROUTE_APP_SESSION_AUTH }
);
