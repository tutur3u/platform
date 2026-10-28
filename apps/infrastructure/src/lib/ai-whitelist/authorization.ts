import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import 'server-only';

import {
  resolveSatellitePageActor,
  resolveSatelliteRequestActor,
} from '@tuturuuu/satellite/workspace-access';
import { getVerifiedAuthUser } from '@tuturuuu/supabase/next/user';

export async function hasAIWhitelistAccess(request?: Request) {
  const actor = request
    ? await resolveSatelliteRequestActor(request, 'infra')
    : await resolveSatellitePageActor('infra');

  if (!actor) return false;
  return isVerifiedTuturuuuStaffSession(
    await getVerifiedAuthUser(actor.admin, actor.user.id)
  );
}
