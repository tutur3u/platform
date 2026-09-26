import 'server-only';

import {
  resolveSatellitePageActor,
  resolveSatelliteRequestActor,
} from '@tuturuuu/satellite/workspace-access';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';

export async function getManagedCronAdminUser(request?: Request) {
  const actor = request
    ? await resolveSatelliteRequestActor(request, 'infra')
    : await resolveSatellitePageActor('infra');

  return isExactTuturuuuDotComEmail(actor?.user.email) ? actor?.user : null;
}

export async function hasManagedCronAdminAccess(request?: Request) {
  return Boolean(await getManagedCronAdminUser(request));
}
