// App and Web URLs. This module imports no satellite or i18n code, so the
// locale routing can read the app base without an import cycle.
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export const PORT = process.env.PORT || 7816;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const MIND_MOUNT_URL = 'https://tuturuuu.com/mind';
const MIND_SUBDOMAIN_URL = 'https://mind.tuturuuu.com';

// Only the production native profile (a build-time literal) is served at the
// apex mount; the staging profile and the Next deployment serve the subdomain.
const DEFAULT_MIND_APP_URL =
  process.env.NODE_ENV !== 'production'
    ? getLocalInternalAppUrl('mind', `http://localhost:${PORT}`)
    : process.env.VITE_MIND_NATIVE_PROFILE === 'production'
      ? MIND_MOUNT_URL
      : MIND_SUBDOMAIN_URL;

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
