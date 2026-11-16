import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { financeBakedApexUrl } from '../start-bridge/finance-mounts.mjs';

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
export const PORT = process.env.PORT || 7808;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_FINANCE_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://finance.tuturuuu.com'
    : getLocalInternalAppUrl('finance', `http://localhost:${PORT}`);
const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

const FINANCE_URL_CANDIDATES = [
  process.env.FINANCE_APP_URL,
  process.env.NEXT_PUBLIC_FINANCE_APP_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.BASE_URL,
];

// The shared resolver classifies https://tuturuuu.com/finance as the platform
// origin and skips it. Accept that exact root here so the production profile
// wins. Every other candidate still goes through the shared resolver.
export const BASE_URL =
  financeBakedApexUrl(FINANCE_URL_CANDIDATES) ??
  resolveInternalAppUrl({
    appName: 'finance',
    candidates: FINANCE_URL_CANDIDATES,
    fallback: DEFAULT_FINANCE_APP_URL,
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
