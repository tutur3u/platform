import 'server-only';

import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';

/**
 * A verified @tuturuuu.com staff session (confirmed address, fresh Auth
 * lookup) that is a root workspace MEMBER with manage_workspace_roles.
 */
export async function getPolicyNoticeOperator(request: Request) {
  const actor = await resolveSatelliteRequestActor(request, 'infra');
  if (!actor) return null;
  const authUser = await getVerifiedAuthUser(actor.admin, actor.user.id);
  if (!isVerifiedTuturuuuStaffSession(authUser)) return null;
  const permissions = await getPermissions({
    user: actor.user,
    wsId: ROOT_WORKSPACE_ID,
  });
  if (
    permissions?.membershipType !== 'MEMBER' ||
    !permissions.containsPermission('manage_workspace_roles')
  )
    return null;
  return { id: actor.user.id, admin: actor.admin };
}
