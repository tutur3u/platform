import 'server-only';

import {
  resolveSatellitePageActor,
  resolveSatelliteRequestActor,
} from '@tuturuuu/satellite/workspace-access';

export async function hasAIWhitelistAccess(request?: Request) {
  const actor = request
    ? await resolveSatelliteRequestActor(request, 'infra')
    : await resolveSatellitePageActor('infra');

  return Boolean(actor?.user.email?.endsWith('@tuturuuu.com'));
}
