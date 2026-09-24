import { createRefreshPOST } from '@tuturuuu/auth/cross-app/server';
import { TTR_URL } from '@tuturuuu/meet-core/constants/common';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';

const MEET_APP_NAME = MEETING_APP as Parameters<typeof createRefreshPOST>[0];

export const POST = createRefreshPOST(MEET_APP_NAME, {
  verificationBaseUrl: TTR_URL,
});
