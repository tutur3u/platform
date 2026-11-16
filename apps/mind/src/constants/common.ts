import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

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

export const PORT = process.env.PORT || 7816;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_MIND_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com/mind'
    : getLocalInternalAppUrl('mind', `http://localhost:${PORT}`);

const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

const MIND_APP_URL_CANDIDATES = [
  process.env.MIND_APP_URL,
  process.env.NEXT_PUBLIC_MIND_APP_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.BASE_URL,
];
const MIND_MOUNT_URL = 'https://tuturuuu.com/mind';

export const MIND_APP_URL = MIND_APP_URL_CANDIDATES.some(
  (candidate) => candidate?.trim().replace(/\/+$/u, '') === MIND_MOUNT_URL
)
  ? MIND_MOUNT_URL
  : resolveInternalAppUrl({
      appName: 'mind',
      candidates: MIND_APP_URL_CANDIDATES.filter((candidate) => {
        if (!candidate) return false;
        try {
          return new URL(candidate).hostname !== 'tuturuuu.com';
        } catch {
          return false;
        }
      }),
      fallback: DEFAULT_MIND_APP_URL,
    });

export const BASE_URL = MIND_APP_URL;

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
