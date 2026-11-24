import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import {
  handleTaskCommentPATCH,
  handleTaskCommentDELETE,
} from '@tuturuuu/tasks-api/server/tasks/external/comments';
import { withSessionAuth } from '@/lib/api-auth';

type Params = { wsId: string; taskId: string; commentId: string };

const APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

export const PATCH = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskCommentPATCH(
      request,
      { params: Promise.resolve(params) },
      {
        appSession: Boolean(getAppSessionTokenFromRequest(request)),
        supabase,
        user,
      }
    ),
  { allowAppSessionAuth: APP_SESSION_AUTH }
);

export const DELETE = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleTaskCommentDELETE(
      request,
      { params: Promise.resolve(params) },
      {
        appSession: Boolean(getAppSessionTokenFromRequest(request)),
        supabase,
        user,
      }
    ),
  { allowAppSessionAuth: APP_SESSION_AUTH }
);
