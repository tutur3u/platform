import { createAppOnlyLogoutHandlers } from '@tuturuuu/auth/app-session';
import { WEB_APP_URL } from '@/constants/common';

const handlers = createAppOnlyLogoutHandlers({
  centralOrigin: WEB_APP_URL,
});

export const GET = handlers.GET;
export const OPTIONS = handlers.OPTIONS;
export const POST = handlers.POST;
