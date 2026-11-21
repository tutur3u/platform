import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import type { PermissionId } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

export async function requirePostEmailQueueRootAdmin(
  request: Request,
  permission: PermissionId = 'view_infrastructure'
) {
  const actor = await resolveSatelliteRequestActor(request, 'infra');
  if (!actor)
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  const permissions = await getPermissions({
    user: actor.user,
    wsId: ROOT_WORKSPACE_ID,
  });
  if (
    permissions?.membershipType !== 'MEMBER' ||
    !permissions?.containsPermission(permission)
  ) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }
  return { user: actor.user };
}
