import { createRefreshPOST } from '@tuturuuu/auth/cross-app/server';
import { TTR_URL } from '@/constants/common';

const MEET_APP_NAME = 'meet' as Parameters<typeof createRefreshPOST>[0];

export const POST = createRefreshPOST(MEET_APP_NAME, {
  verificationBaseUrl: TTR_URL,
});
