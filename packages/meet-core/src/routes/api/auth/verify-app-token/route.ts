import { createPOST } from '@tuturuuu/auth/cross-app/server';
import { TTR_URL } from '@tuturuuu/meet-core/constants/common';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';

export const POST = createPOST(MEETING_APP, {
  verificationBaseUrl: TTR_URL,
});
