import { createAppOnlyLogoutHandlers } from '@tuturuuu/auth/app-session';
import { createHivePublicUrl } from '@/lib/hive-public-url';
import { WEB_APP_URL } from '@/constants/app-origins';

const handlers = createAppOnlyLogoutHandlers({
  centralOrigin: WEB_APP_URL,
  confirmationOnGet: true,
  getAppOrigin: (request) => createHivePublicUrl('/', request).origin,
});

export const GET = handlers.GET;
export const OPTIONS = handlers.OPTIONS;
export const POST = handlers.POST;
