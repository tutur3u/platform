import { createPOST } from '@tuturuuu/auth/cross-app/server';
import { TTR_URL } from '@/constants/common';

export const POST = createPOST('finance', {
  verificationBaseUrl: TTR_URL,
});
