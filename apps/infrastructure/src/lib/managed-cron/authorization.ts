import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import 'server-only';

import {
  resolveSatellitePageActor,
  resolveSatelliteRequestActor,
} from '@tuturuuu/satellite/workspace-access';

export async function getManagedCronAdminUser(request?: Request) {
  const actor = request
    ? await resolveSatelliteRequestActor(request, 'infra')
    : await resolveSatellitePageActor('infra');

  return isVerifiedTuturuuuStaffSession(
    actor && (await getVerifiedAuthUser(actor.admin, actor.user.id))
  )
    ? actor?.user
    : null;
}

export async function hasManagedCronAdminAccess(request?: Request) {
  return Boolean(await getManagedCronAdminUser(request));
}
