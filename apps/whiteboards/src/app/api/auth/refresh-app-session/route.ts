import { createRefreshPOST } from '@tuturuuu/auth/cross-app/server';
import { TTR_URL } from '@/constants/common';

export const POST = createRefreshPOST('whiteboards', {
  verificationBaseUrl: TTR_URL,
});
