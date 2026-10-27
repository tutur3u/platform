import 'server-only';

import {
  resolveSatellitePageActor,
  resolveSatelliteRequestActor,
} from '@tuturuuu/satellite/workspace-access';
import { getVerifiedAuthEmail } from '@tuturuuu/supabase/next/user';

export async function hasAIWhitelistAccess(request?: Request) {
  const actor = request
    ? await resolveSatelliteRequestActor(request, 'infra')
    : await resolveSatellitePageActor('infra');

  if (!actor) return false;
  const email = await getVerifiedAuthEmail(actor.admin, actor.user.id);
  return Boolean(email?.endsWith('@tuturuuu.com'));
}
