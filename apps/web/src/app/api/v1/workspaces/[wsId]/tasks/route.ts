import {
  handleTaskRouteGET,
  handleTaskRoutePOST,
} from '@tuturuuu/apis/tu-do/tasks/route';
import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import { withSessionAuth } from '@/lib/api-auth';

type Params = { wsId: string };

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
  { allowAppSessionAuth: true }
);

export const POST = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskRoutePOST(request, createTaskRouteContext(params), {
      appSession: isAppSessionRequest(request),
      supabase,
      user,
    }),
  { allowAppSessionAuth: true }
);
