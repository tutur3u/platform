import { isAppMounted } from '@tuturuuu/utils/app-mounts';
import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getMindAppOrigin() {
  // Links move to the apex mount only once `mind` is an active app mount.
  if (process.env.NODE_ENV === 'production' && isAppMounted('mind'))
    return 'https://tuturuuu.com/mind';
  return resolveInternalAppUrl({
    appName: 'mind',
    candidates: [
      process.env.MIND_APP_URL,
      process.env.NEXT_PUBLIC_MIND_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://mind.tuturuuu.com'
        : getLocalInternalAppUrl('mind', 'http://localhost:7816'),
  });
}
