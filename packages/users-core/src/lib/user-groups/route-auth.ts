import {
  createAppSessionUser,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';

const USER_GROUP_APP_SESSION_TARGETS = [
  'contacts',
  'platform',
  'teach',
] as const;

export function resolveUserGroupAppSessionUser(request: Request) {
  const verification = verifyAppSessionRequest(request, {
    targetApp: USER_GROUP_APP_SESSION_TARGETS,
  });

  return verification.ok ? createAppSessionUser(verification.claims) : null;
}

export async function getUserGroupRoutePermissions(
  wsId: string,
  request: Request
) {
  const appSessionUser = resolveUserGroupAppSessionUser(request);

  return appSessionUser
    ? getPermissions({ user: appSessionUser, wsId })
    : getPermissions({ request, wsId });
}
