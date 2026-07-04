import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getMindAppOrigin() {
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
