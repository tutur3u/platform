import type { PermissionId } from '@tuturuuu/types';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { resolveSessionAuthContext } from '@/lib/api-auth';

export async function resolveWorkspaceRouteAccess(
  request: Request,
  wsId: string,
  requiredPermissions: PermissionId[] = []
) {
  const session = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
  });

  if (!session.ok) return session;

  const permissions = await getPermissions({ user: session.user, wsId });
  if (!permissions) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  if (
    requiredPermissions.length > 0 &&
    requiredPermissions.every((permission) =>
      permissions.withoutPermission(permission)
    )
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { message: 'Workspace permission denied' },
        { status: 403 }
      ),
    };
  }

  return { ...session, permissions };
}
