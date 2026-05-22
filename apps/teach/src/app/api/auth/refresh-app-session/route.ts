import { createRefreshPOST } from '@tuturuuu/auth/cross-app/server';
import { WEB_APP_URL } from '@/constants/common';

export const POST = createRefreshPOST('teach', {
  verificationBaseUrl: WEB_APP_URL,
});
