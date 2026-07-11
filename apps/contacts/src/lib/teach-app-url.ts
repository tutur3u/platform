import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getTeachAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'teach',
    candidates: [
      process.env.TEACH_APP_URL,
      process.env.NEXT_PUBLIC_TEACH_APP_URL,
      process.env.TUTURUUU_TEACH_BASE_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://teach.tuturuuu.com'
        : getLocalInternalAppUrl('teach', 'http://localhost:7813'),
  });
}
