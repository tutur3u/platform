import {
  DELETE as deleteMembers,
  GET as getMembers,
} from '@tuturuuu/apis/members/route';
import { withSessionAuth } from '@/lib/api-auth';

interface Params {
  wsId: string;
}

const MEMBERS_APP_SESSION_AUTH = { targetApp: 'tasks' } as const;

export const GET = withSessionAuth<Params>(
  (request, authContext, params) =>
    getMembers(
      request,
      { params: Promise.resolve({ wsId: params.wsId }) },
      authContext
    ),
  { allowAppSessionAuth: MEMBERS_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<Params>(
  (request, authContext, params) =>
    deleteMembers(
      request,
      { params: Promise.resolve({ wsId: params.wsId }) },
      authContext
    ),
  { allowAppSessionAuth: MEMBERS_APP_SESSION_AUTH }
);
