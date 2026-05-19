import 'server-only';

import {
  getCurrentUserAIWhitelistStatus,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';

export async function isCurrentUserAIWhitelisted() {
  const status = await getCurrentUserAIWhitelistStatus(
    withForwardedInternalApiAuth(await headers())
  );

  return status.enabled;
}
