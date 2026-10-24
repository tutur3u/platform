import {
  createAppSessionUser,
  getAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

type DevboxUserResolution =
  | {
      ok: true;
      user: SupabaseUser;
      authentication: 'cli' | 'session';
    }
  | {
      ok: false;
      response: NextResponse;
    };

async function resolveDevboxRequestUser(
  request: Request
): Promise<DevboxUserResolution> {
  const appSessionToken = getAppSessionTokenFromRequest(request);

  if (appSessionToken) {
    const appSessionVerification = verifyCliAccessToken(appSessionToken);

    if (appSessionVerification.ok) {
      return {
        ok: true,
        user: createAppSessionUser(appSessionVerification.claims),
        authentication:
          request.headers
            .get('authorization')
            ?.match(/^Bearer (\S+)$/i)?.[1] === appSessionToken
            ? 'cli'
            : 'session',
      };
    }
  }

  const actor = await resolveSatelliteRequestActor(request, 'infra');

  if (!actor) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  return {
    ok: true as const,
    user: actor.user,
    authentication: 'session',
  };
}

export async function authorizeDevboxRootMember(request: Request) {
  const resolvedUser = await resolveDevboxRequestUser(request);
  if (!resolvedUser.ok) {
    return resolvedUser;
  }

  const permissions = await getPermissions({
    request,
    user: resolvedUser.user,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (permissions?.membershipType !== 'MEMBER') {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    user: resolvedUser.user,
  };
}

// Runner trust changes (features, drain) match the Infrastructure dashboard
// gate: root membership plus a root secrets/roles management permission.
export async function authorizeDevboxRootAdmin(request: Request) {
  const resolvedUser = await resolveDevboxRequestUser(request);
  if (!resolvedUser.ok) {
    return resolvedUser;
  }

  const permissions = await getPermissions({
    request,
    user: resolvedUser.user,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (
    permissions?.membershipType !== 'MEMBER' ||
    (permissions.withoutPermission('manage_workspace_secrets') &&
      permissions.withoutPermission('manage_workspace_roles'))
  ) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    user: resolvedUser.user,
    authentication: resolvedUser.authentication,
  };
}
