import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

export const PORT = process.env.PORT || 7813;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;
export const LEARN_PORT = process.env.LEARN_PORT || 7812;

const DEFAULT_TEACH_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://teach.tuturuuu.com'
    : getLocalInternalAppUrl('teach', `http://localhost:${PORT}`);

const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

const DEFAULT_LEARN_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://learn.tuturuuu.com'
    : getLocalInternalAppUrl('learn', `http://localhost:${LEARN_PORT}`);

export const BASE_URL = resolveInternalAppUrl({
  appName: 'teach',
  candidates: [
    process.env.TEACH_APP_URL,
    process.env.NEXT_PUBLIC_TEACH_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_TEACH_APP_URL,
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

export const LEARN_APP_URL = resolveInternalAppUrl({
  appName: 'learn',
  candidates: [
    process.env.NEXT_PUBLIC_LEARN_APP_URL,
    process.env.LEARN_APP_URL,
  ],
  fallback: DEFAULT_LEARN_APP_URL,
});
