import { isAppMounted } from '@tuturuuu/utils/app-mounts';
import { meetPublicUrl } from '@tuturuuu/utils/meet-url';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getMeetAppOrigin() {
  if (isAppMounted('meet')) return meetPublicUrl();
  return getMeetServiceOrigin();
}

export function getMeetServiceOrigin() {
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
