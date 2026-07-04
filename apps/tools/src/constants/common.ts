import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export const PORT = process.env.PORT || 7825;

export const DEV_MODE = process.env.NODE_ENV === 'development';
export const PROD_MODE = process.env.NODE_ENV === 'production';
export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

const DEFAULT_TOOLS_APP_URL = PROD_MODE
  ? 'https://tools.tuturuuu.com'
  : getLocalInternalAppUrl('tools', `http://localhost:${PORT}`);

export const BASE_URL = resolveInternalAppUrl({
  appName: 'tools',
  candidates: [
    process.env.TOOLS_APP_URL,
    process.env.NEXT_PUBLIC_TOOLS_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_TOOLS_APP_URL,
});
