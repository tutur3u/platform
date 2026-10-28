import {
  createAppSessionUser,
  getAppSessionTokenFromRequest,
} from '@tuturuuu/auth/app-session';
import { verifyCliAccessToken } from '@tuturuuu/auth/cli-session';
import { checkCsrf } from '@tuturuuu/auth/csrf';
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
  if (
    /^Bearer td(?:ba|bx)_/i.test(request.headers.get('authorization') ?? '') ||
    request.headers.has('X-Devbox-Access-Token') ||
    request.headers.has('X-Devbox-Runner-Token')
  ) {
    return {
      ok: false,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }
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

export async function requireDevboxActor(
  request: Request,
  role: 'member' | 'viewer' | 'admin'
) {
  const csrf = checkCsrf({
    allowedOrigins: [new URL(request.url).origin],
    exemptions: [],
    headers: request.headers,
    method: request.method,
    pathname: new URL(request.url).pathname,
  });
  if (!csrf.ok)
    return {
      ok: false as const,
      response: NextResponse.json(
        { code: 'CSRF_REJECTED', message: 'Forbidden' },
        { status: 403 }
      ),
    };
  const resolvedUser = await resolveDevboxRequestUser(request);
  if (!resolvedUser.ok) return resolvedUser;
  const permissions = await getPermissions({
    request,
    user: resolvedUser.user,
    wsId: ROOT_WORKSPACE_ID,
  });
  if (
    permissions?.membershipType !== 'MEMBER' ||
    (role === 'viewer' &&
      permissions.withoutPermission('view_infrastructure')) ||
    (role === 'admin' &&
      permissions.withoutPermission('manage_workspace_secrets') &&
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

export const authorizeDevboxRootMember = (request: Request) =>
  requireDevboxActor(request, 'member');
export const authorizeDevboxRootViewer = (request: Request) =>
  requireDevboxActor(request, 'viewer');
export const authorizeDevboxRootAdmin = (request: Request) =>
  requireDevboxActor(request, 'admin');
