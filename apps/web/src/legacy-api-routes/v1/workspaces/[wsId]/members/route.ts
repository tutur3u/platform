import {
  DELETE as deleteMembers,
  GET as getMembers,
} from '@tuturuuu/apis/members/route';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

interface Params {
  wsId: string;
}

export const GET = withSessionAuth<Params>(
  async (req, authContext, { wsId }) => {
    const normalizedWsId = await normalizeWorkspaceId(
      wsId,
      authContext.supabase
    );

    return getMembers(
      req,
      { params: Promise.resolve({ wsId: normalizedWsId }) },
      authContext
    );
  },
  { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<Params>(
  async (req, authContext, { wsId }) => {
    const normalizedWsId = await normalizeWorkspaceId(
      wsId,
      authContext.supabase
    );

    return deleteMembers(
      req,
      { params: Promise.resolve({ wsId: normalizedWsId }) },
      authContext
    );
  },
  { allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH }
);
