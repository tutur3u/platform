import { verifyAppSessionRequest } from '@tuturuuu/auth/app-session';
import {
  CLI_APP_ACCESS_SCOPE,
  CLI_APP_TARGET_APP,
} from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export function verifyCmsOrCliSession(request: Request) {
  const cms = verifyAppSessionRequest(request, { targetApp: 'cms' });
  return cms.ok
    ? cms
    : verifyAppSessionRequest(request, {
        targetApp: CLI_APP_TARGET_APP,
        requiredScope: CLI_APP_ACCESS_SCOPE,
      });
}

export function hasRootExternalProjectsAdminPermission(
  permissions: PermissionsResult | null
) {
  return Boolean(
    permissions?.containsPermission('manage_external_projects') ||
      permissions?.containsPermission('manage_workspace_roles')
  );
}

export async function requireExternalControlPlaneAccess(
  request: Request,
  area: 'projects' | 'apps'
) {
  const { resolveSessionAuthContext } = await import('@/lib/api-auth');
  const session = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: [
      { targetApp: area === 'apps' ? 'infra' : 'cms' },
      { targetApp: CLI_APP_TARGET_APP, requiredScope: CLI_APP_ACCESS_SCOPE },
    ],
  });
  if (!session.ok) return session;
  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    user: session.user,
    request,
  });
  const allowed =
    area === 'projects'
      ? hasRootExternalProjectsAdminPermission(permissions)
      : Boolean(
          permissions?.containsPermission('manage_workspace_secrets') ||
            permissions?.containsPermission('manage_workspace_roles')
        );
  if (!allowed)
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  return {
    ...session,
    admin: await createAdminClient({ noCookie: true }),
    permissions,
  };
}

export function requireRootExternalProjectsAdmin(request: Request) {
  return requireExternalControlPlaneAccess(request, 'projects');
}
