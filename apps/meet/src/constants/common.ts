import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { supportedLocales } from '@/i18n/routing';

// Re-export shared constants from satellite package
export {
  LOCALE_COOKIE_NAME,
  SHOW_TAILWIND_INDICATOR,
  SIDEBAR_BEHAVIOR_COOKIE_NAME,
  SIDEBAR_COLLAPSED_COOKIE_NAME,
  THEME_COOKIE_NAME,
} from '@tuturuuu/satellite/constants';

export const DEV_MODE = process.env.NODE_ENV === 'development';
export const PROD_MODE = process.env.NODE_ENV === 'production';

// App-specific constants
export const PORT = process.env.PORT || 7807;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_MEET_APP_URL = PROD_MODE
  ? 'https://meet.tuturuuu.com'
  : getLocalInternalAppUrl('meet', `http://localhost:${PORT}`);
const DEFAULT_WEB_APP_URL = PROD_MODE
  ? 'https://tuturuuu.com'
  : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

export const BASE_URL = resolveInternalAppUrl({
  appName: 'meet',
  candidates: [
    process.env.MEET_APP_URL,
    process.env.NEXT_PUBLIC_MEET_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_MEET_APP_URL,
});

export const API_URL = process.env.API_URL || `${BASE_URL}/api`;

export const TTR_URL = resolveInternalAppUrl({
  appName: 'platform',
  candidates: [
    process.env.TTR_URL,
    process.env.NEXT_PUBLIC_WEB_APP_URL,
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ],
  fallback: DEFAULT_WEB_APP_URL,
});

export const PUBLIC_PATHS = ['/verify-token'].reduce((acc: string[], path) => {
  // Add the original path
  acc.push(path);

  // Add localized paths
  const localizedPaths = supportedLocales.map((locale) => `/${locale}${path}`);
  acc.push(...localizedPaths);

  return acc;
}, []);
