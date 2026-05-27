import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export {
  DEV_MODE,
  LOCALE_COOKIE_NAME,
  PROD_MODE,
  PUBLIC_PATHS,
  SHOW_TAILWIND_INDICATOR,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
  THEME_COOKIE_NAME,
} from '@tuturuuu/satellite/constants';

export const PORT = process.env.PORT || 7821;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_CHAT_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://chat.tuturuuu.com'
    : getLocalInternalAppUrl('chat', `http://localhost:${PORT}`);

const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

export const CHAT_APP_URL = resolveInternalAppUrl({
  appName: 'chat',
  candidates: [
    process.env.CHAT_APP_URL,
    process.env.NEXT_PUBLIC_CHAT_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_CHAT_APP_URL,
});

export const BASE_URL = CHAT_APP_URL;

export const WEB_APP_URL = resolveInternalAppUrl({
  appName: 'platform',
  candidates: [
    process.env.NEXT_PUBLIC_WEB_APP_URL,
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ],
  fallback: DEFAULT_WEB_APP_URL,
});

export const TTR_URL = WEB_APP_URL;
