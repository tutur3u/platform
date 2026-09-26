import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import {
  getPermissions,
  resolveWorkspaceIdForPrincipal,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function authorizeInfrastructureMigrationExport(
  request: Request,
  wsId: string
) {
  const actor = await resolveSatelliteRequestActor(request, 'infra');

  if (!actor) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  let normalizedWsId: string;

  try {
    normalizedWsId = await resolveWorkspaceIdForPrincipal({
      authorizationClient: actor.admin,
      principal: { email: actor.user.email ?? null, id: actor.user.id },
      wsId,
    });
  } catch (error) {
    console.error('Error normalizing infrastructure export workspace:', {
      error,
      wsId,
    });

    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  const permissions = await getPermissions({
    user: actor.user,
    wsId: normalizedWsId,
  });

  if (!permissions) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Not found' }, { status: 404 }),
    };
  }

  if (!permissions.containsPermission('manage_external_migrations')) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    value: {
      userId: actor.user.id,
      wsId: normalizedWsId,
    },
  };
}
