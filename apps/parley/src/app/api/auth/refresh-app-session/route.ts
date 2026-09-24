import { createRefreshPOST } from '@tuturuuu/auth/cross-app/server';
import { TTR_URL } from '@tuturuuu/meet-core/constants/common';

const PARLEY_APP_NAME = 'parley' as Parameters<typeof createRefreshPOST>[0];

export const POST = createRefreshPOST(PARLEY_APP_NAME, {
  verificationBaseUrl: TTR_URL,
});
