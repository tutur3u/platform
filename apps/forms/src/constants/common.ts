import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

export const DEV_MODE = process.env.NODE_ENV === 'development';
export const PROD_MODE = process.env.NODE_ENV === 'production';

export const PORT = process.env.PORT || 7828;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_FORMS_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://forms.tuturuuu.com'
    : getLocalInternalAppUrl('forms', `http://localhost:${PORT}`);

const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

export const BASE_URL = resolveInternalAppUrl({
  appName: 'forms',
  candidates: [
    process.env.FORMS_APP_URL,
    process.env.NEXT_PUBLIC_FORMS_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_FORMS_APP_URL,
});

export const WEB_APP_URL = resolveInternalAppUrl({
  appName: 'platform',
  candidates: [
    process.env.NEXT_PUBLIC_WEB_APP_URL,
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ],
  fallback: DEFAULT_WEB_APP_URL,
});
