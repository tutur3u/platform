import {
  handleTaskDescriptionRouteGET,
  handleTaskDescriptionRoutePATCH,
} from '@tuturuuu/apis/tu-do/tasks/taskId/description/route';
import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { withSessionAuth } from '@/lib/api-auth';

type Params = { wsId: string; taskId: string };

const TASK_DESCRIPTION_ROUTE_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'calendar', 'tasks'],
} as const;

function createTaskDescriptionRouteContext(params: Params) {
  return { params: Promise.resolve(params) };
}

function isAppSessionRequest(request: Request) {
  return Boolean(getAppSessionTokenFromRequest(request));
}

export const GET = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskDescriptionRouteGET(
      request,
      createTaskDescriptionRouteContext(params),
      {
        appSession: isAppSessionRequest(request),
        supabase,
        user,
      }
    ),
  { allowAppSessionAuth: TASK_DESCRIPTION_ROUTE_APP_SESSION_AUTH }
);

export const PATCH = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskDescriptionRoutePATCH(
      request,
      createTaskDescriptionRouteContext(params),
      {
        appSession: isAppSessionRequest(request),
        supabase,
        user,
      }
    ),
  { allowAppSessionAuth: TASK_DESCRIPTION_ROUTE_APP_SESSION_AUTH }
);
