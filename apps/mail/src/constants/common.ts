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

export const PORT = process.env.PORT || 7820;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_MAIL_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://mail.tuturuuu.com'
    : getLocalInternalAppUrl('mail', `http://localhost:${PORT}`);

const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

export const MAIL_APP_URL = resolveInternalAppUrl({
  appName: 'mail',
  candidates: [
    process.env.MAIL_APP_URL,
    process.env.NEXT_PUBLIC_MAIL_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_MAIL_APP_URL,
});

export const BASE_URL = MAIL_APP_URL;
export const API_URL = process.env.API_URL || `${BASE_URL}/api`;

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
