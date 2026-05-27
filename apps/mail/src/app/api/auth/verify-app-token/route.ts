import { createPOST } from '@tuturuuu/auth/cross-app/server';
import { WEB_APP_URL } from '@/constants/common';

export const POST = createPOST('mail', {
  verificationBaseUrl: WEB_APP_URL,
});
