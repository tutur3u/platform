import { createPOST } from '@tuturuuu/auth/cross-app/server';
import { TTR_URL } from '@/constants/common';

const MEET_APP_NAME = 'meet' as Parameters<typeof createPOST>[0];

export const POST = createPOST(MEET_APP_NAME, {
  verificationBaseUrl: TTR_URL,
});
