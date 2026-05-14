import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';

// Re-export shared constants from satellite package
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

// App-specific constants
export const PORT = process.env.PORT || 7804;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_REWISE_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://rewise.me'
    : `http://localhost:${PORT}`;
const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : `http://localhost:${CENTRAL_PORT}`;

export const BASE_URL = resolveInternalAppUrl({
  appName: 'rewise',
  candidates: [
    process.env.REWISE_APP_URL,
    process.env.NEXT_PUBLIC_REWISE_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_REWISE_APP_URL,
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
