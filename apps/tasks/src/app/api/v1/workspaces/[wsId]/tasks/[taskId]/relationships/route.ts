import {
  handleTaskRelationshipRouteDELETE,
  handleTaskRelationshipRouteGET,
  handleTaskRelationshipRoutePOST,
} from '@tuturuuu/apis/tu-do/tasks/taskId/relationships/route';
import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { withSessionAuth } from '@/lib/api-auth';

type Params = { wsId: string; taskId: string };

const TASK_RELATIONSHIP_ROUTE_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

function createTaskRelationshipRouteContext(params: Params) {
  return { params: Promise.resolve(params) };
}

function isAppSessionRequest(request: Request) {
  return Boolean(getAppSessionTokenFromRequest(request));
}

export const GET = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskRelationshipRouteGET(
      request,
      createTaskRelationshipRouteContext(params),
      {
        appSession: isAppSessionRequest(request),
        supabase,
        user,
      }
    ),
  { allowAppSessionAuth: TASK_RELATIONSHIP_ROUTE_APP_SESSION_AUTH }
);

export const POST = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskRelationshipRoutePOST(
      request,
      createTaskRelationshipRouteContext(params),
      {
        appSession: isAppSessionRequest(request),
        supabase,
        user,
      }
    ),
  { allowAppSessionAuth: TASK_RELATIONSHIP_ROUTE_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskRelationshipRouteDELETE(
      request,
      createTaskRelationshipRouteContext(params),
      {
        appSession: isAppSessionRequest(request),
        supabase,
        user,
      }
    ),
  { allowAppSessionAuth: TASK_RELATIONSHIP_ROUTE_APP_SESSION_AUTH }
);
