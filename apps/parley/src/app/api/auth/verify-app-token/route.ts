import { createPOST } from '@tuturuuu/auth/cross-app/server';
import { TTR_URL } from '@tuturuuu/meet-core/constants/common';

export const POST = createPOST('parley', {
  verificationBaseUrl: TTR_URL,
});
