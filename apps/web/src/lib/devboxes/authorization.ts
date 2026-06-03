import {
  createAppSessionUser,
  getAppSessionTokenFromRequest,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

type DevboxUserResolution =
  | {
      ok: true;
      user: SupabaseUser;
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
    const appSessionVerification = verifyAppSessionRequest(request, {
      targetApp: CLI_APP_TARGET_APP,
    });

    if (!appSessionVerification.ok) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { message: 'Unauthorized' },
          { status: 401 }
        ),
      };
    }

    return {
      ok: true as const,
      user: createAppSessionUser(appSessionVerification.claims),
    };
  }

  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  return {
    ok: true as const,
    user,
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
