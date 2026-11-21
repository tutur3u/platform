import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import 'server-only';

import {
  resolveSatellitePageActor,
  resolveSatelliteRequestActor,
} from '@tuturuuu/satellite/workspace-access';

import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';

export async function hasAIWhitelistAccess(request?: Request) {
  const actor = request
    ? await resolveSatelliteRequestActor(request, 'infra')
    : await resolveSatellitePageActor('infra');

  if (!actor) return false;
  if (
    !isVerifiedTuturuuuStaffSession(
      await getVerifiedAuthUser(actor.admin, actor.user.id)
    )
  )
    return false;
  const permissions = await getPermissions({
    user: actor.user,
    wsId: ROOT_WORKSPACE_ID,
  });
  if (
    permissions?.membershipType !== 'MEMBER' ||
    !permissions?.containsPermission('manage_workspace_roles')
  )
    return false;
  return Boolean(actor);
}
