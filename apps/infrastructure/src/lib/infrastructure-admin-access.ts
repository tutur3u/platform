import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { PermissionId } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

async function getInfrastructureBearerUser(authorization: string) {
  const token = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
  if (!token) return null;
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
}

async function getInfrastructureSessionUser(request?: Request) {
  const authorization = request?.headers.get('authorization');
  const user =
    authorization !== undefined && authorization !== null
      ? await getInfrastructureBearerUser(authorization)
      : await getSatelliteAppSessionUser('infra');

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { ok: true as const, user };
}

export async function authorizeInfrastructureAdminRequest(
  requiredPermission: PermissionId | PermissionId[] = 'view_infrastructure',
  requireRootMember = true,
  request?: Request
) {
  const session = await getInfrastructureSessionUser(request);
  if (!session.ok) return session;

  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    user: session.user,
  });
  const requiredPermissions = Array.isArray(requiredPermission)
    ? requiredPermission
    : [requiredPermission];

  if (
    (requireRootMember && permissions?.membershipType !== 'MEMBER') ||
    !requiredPermissions.some((permission) =>
      permissions?.containsPermission(permission)
    )
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Infrastructure permission required' },
        { status: 403 }
      ),
    };
  }

  const sbAdmin: TypedSupabaseClient = await createAdminClient({
    noCookie: true,
  });

  return {
    ok: true as const,
    sbAdmin,
    user: session.user,
  };
}

export async function authorizeInfrastructureWorkspaceSecretsRequest() {
  return authorizeInfrastructureAdminRequest([
    'manage_workspace_secrets',
    'manage_workspace_roles',
  ]);
}

export async function authorizeInfrastructureWorkspaceRequest(
  wsId: string,
  permission: PermissionId
) {
  const session = await getInfrastructureSessionUser();
  if (!session.ok) return session;

  const permissions = await getPermissions({ user: session.user, wsId });
  if (!permissions?.containsPermission(permission)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    sbAdmin: await createAdminClient({ noCookie: true }),
    user: session.user,
    wsId: permissions.wsId,
  };
}

export async function authorizeInfrastructureRootMemberRequest(
  requiredPermission: PermissionId | PermissionId[] = 'view_infrastructure'
) {
  return authorizeInfrastructureAdminRequest(requiredPermission, true);
}
