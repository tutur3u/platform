import { getAppSessionTokenFromRequest } from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { handleGithubImportPOST } from '@tuturuuu/tasks-api/server/tasks/external/import/handler';
import { withSessionAuth } from '@/lib/api-auth';

type Params = { wsId: string };

const MAX_IMPORT_REQUEST_BYTES = 4 * 1024 * 1024;

export const POST = withSessionAuth<Params>(
  (request, { supabase, user }, params) =>
    handleGithubImportPOST(
      request,
      { params: Promise.resolve(params) },
      {
        appSession: Boolean(getAppSessionTokenFromRequest(request)),
        supabase,
        user,
      }
    ),
  {
    allowAppSessionAuth: { targetApp: [CLI_APP_TARGET_APP, 'tasks'] },
    maxPayloadSize: MAX_IMPORT_REQUEST_BYTES,
  }
);
