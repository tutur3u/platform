import { createAppOnlyLogoutHandlers } from '@tuturuuu/auth/app-session';
import { TTR_URL } from '../../../../constants/common';

const handlers = createAppOnlyLogoutHandlers({
  centralOrigin: TTR_URL,
});

export const GET = handlers.GET;
export const OPTIONS = handlers.OPTIONS;
export const POST = handlers.POST;
