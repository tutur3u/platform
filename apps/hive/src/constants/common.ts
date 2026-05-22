import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export {
  HIVE_REALTIME_URL,
  resolveHiveRealtimeUrl,
} from '@tuturuuu/hive-ui/config';
export {
  DEV_MODE,
  LOCALE_COOKIE_NAME,
  PROD_MODE,
  SHOW_TAILWIND_INDICATOR,
  THEME_COOKIE_NAME,
} from '@tuturuuu/satellite/constants';

export const PORT = process.env.PORT || 7814;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_HIVE_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://hive.tuturuuu.com'
    : getLocalInternalAppUrl('hive', `http://localhost:${PORT}`);

const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

export const HIVE_APP_URL = resolveInternalAppUrl({
  appName: 'hive',
  candidates: [
    process.env.HIVE_APP_URL,
    process.env.NEXT_PUBLIC_HIVE_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_HIVE_APP_URL,
});

export const BASE_URL = HIVE_APP_URL;

export const WEB_APP_URL = resolveInternalAppUrl({
  appName: 'platform',
  candidates: [
    process.env.NEXT_PUBLIC_WEB_APP_URL,
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ],
  fallback: DEFAULT_WEB_APP_URL,
});
