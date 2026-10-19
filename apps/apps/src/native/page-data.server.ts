import {
  getSatelliteAppSessionUser,
  getSatelliteCurrentUser,
} from '@tuturuuu/satellite/auth';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { getPlatformReleaseInfo } from '@tuturuuu/utils/platform-release';
import { requestLocale } from './locale';
import { requestContext } from './request-context';

export async function loadGatewayData() {
  const actor = await getSatelliteAppSessionUser('apps');
  const profile = await getSatelliteCurrentUser('apps');
  return {
    locale: requestLocale(requestContext().request),
    actorId: actor?.id ?? null,
    release: isExactTuturuuuDotComEmail(profile?.email)
      ? getPlatformReleaseInfo('Tuturuuu Apps')
      : null,
  };
}
