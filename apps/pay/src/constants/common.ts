import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

export const PORT = process.env.PORT || 7826;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_PAY_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://pay.tuturuuu.com'
    : getLocalInternalAppUrl('pay', `http://localhost:${PORT}`);

const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

export const BASE_URL = resolveInternalAppUrl({
  appName: 'pay',
  candidates: [
    process.env.PAY_APP_URL,
    process.env.NEXT_PUBLIC_PAY_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_PAY_APP_URL,
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
