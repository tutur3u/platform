import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export const PORT = process.env.PORT || 7818;

export const DEV_MODE = process.env.NODE_ENV === 'development';
export const PROD_MODE = process.env.NODE_ENV === 'production';
export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

const DEFAULT_APPS_APP_URL = PROD_MODE
  ? 'https://apps.tuturuuu.com'
  : getLocalInternalAppUrl('apps', `http://localhost:${PORT}`);

export const BASE_URL = resolveInternalAppUrl({
  appName: 'apps',
  candidates: [
    process.env.APPS_APP_URL,
    process.env.NEXT_PUBLIC_APPS_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_APPS_APP_URL,
});
