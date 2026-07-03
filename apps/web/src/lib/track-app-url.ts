import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getTrackAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'track',
    candidates: [
      process.env.TRACK_APP_URL,
      process.env.NEXT_PUBLIC_TRACK_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://track.tuturuuu.com'
        : getLocalInternalAppUrl('track', 'http://localhost:7810'),
  });
}
