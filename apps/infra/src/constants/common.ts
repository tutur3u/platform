import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export {
  DEV_MODE,
  LOCALE_COOKIE_NAME,
  PROD_MODE,
  PUBLIC_PATHS,
  SHOW_TAILWIND_INDICATOR,
  THEME_COOKIE_NAME,
} from '@tuturuuu/satellite/constants';

export const PORT = process.env.PORT || 7823;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_INFRA_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://infra.tuturuuu.com'
    : getLocalInternalAppUrl('infra', `http://localhost:${PORT}`);

const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

export const INFRA_APP_URL = resolveInternalAppUrl({
  appName: 'infra',
  candidates: [
    process.env.INFRA_APP_URL,
    process.env.NEXT_PUBLIC_INFRA_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_INFRA_APP_URL,
});

export const BASE_URL = INFRA_APP_URL;
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
