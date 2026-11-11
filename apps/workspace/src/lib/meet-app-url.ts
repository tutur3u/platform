import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getMeetAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'meet',
    candidates: [
      process.env.MEET_APP_URL,
      process.env.NEXT_PUBLIC_MEET_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://meet.tuturuuu.com'
        : getLocalInternalAppUrl('meet', 'http://localhost:7807'),
  });
}
