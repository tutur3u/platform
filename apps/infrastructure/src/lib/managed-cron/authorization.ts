import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import 'server-only';

import {
  resolveSatellitePageActor,
  resolveSatelliteRequestActor,
} from '@tuturuuu/satellite/workspace-access';

import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';

export async function getManagedCronAdminUser(request?: Request) {
  const actor = request
    ? await resolveSatelliteRequestActor(request, 'infra')
    : await resolveSatellitePageActor('infra');

  if (!actor) return null;
  if (
    !isVerifiedTuturuuuStaffSession(
      await getVerifiedAuthUser(actor.admin, actor.user.id)
    )
  )
    return null;
  const permissions = await getPermissions({
    user: actor.user,
    wsId: ROOT_WORKSPACE_ID,
  });
  if (
    permissions?.membershipType !== 'MEMBER' ||
    !(
      permissions?.containsPermission('manage_workspace_roles') ||
      permissions?.containsPermission('manage_workspace_secrets')
    )
  )
    return null;
  return actor?.user ?? null;
}

export async function hasManagedCronAdminAccess(request?: Request) {
  return Boolean(await getManagedCronAdminUser(request));
}
