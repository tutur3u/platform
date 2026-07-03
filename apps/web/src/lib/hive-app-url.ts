import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getHiveAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'hive',
    candidates: [
      process.env.HIVE_APP_URL,
      process.env.NEXT_PUBLIC_HIVE_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://hive.tuturuuu.com'
        : getLocalInternalAppUrl('hive', 'http://localhost:7814'),
  });
}
