import {
  handleTaskLabelRouteDELETE,
  handleTaskLabelRoutePOST,
} from '@tuturuuu/apis/tu-do/tasks/taskId/labels/route';
import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { withSessionAuth } from '@/lib/api-auth';

type Params = { wsId: string; taskId: string };

const TASK_LABEL_ROUTE_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

function createTaskLabelRouteContext(params: Params) {
  return { params: Promise.resolve(params) };
}

function isAppSessionRequest(request: Request) {
  return Boolean(getAppSessionTokenFromRequest(request));
}

export const POST = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskLabelRoutePOST(request, createTaskLabelRouteContext(params), {
      appSession: isAppSessionRequest(request),
      supabase,
      user,
    }),
  { allowAppSessionAuth: TASK_LABEL_ROUTE_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskLabelRouteDELETE(request, createTaskLabelRouteContext(params), {
      appSession: isAppSessionRequest(request),
      supabase,
      user,
    }),
  { allowAppSessionAuth: TASK_LABEL_ROUTE_APP_SESSION_AUTH }
);
