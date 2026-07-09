import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function getPayAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'pay',
    candidates: [
      process.env.PAY_APP_URL,
      process.env.NEXT_PUBLIC_PAY_APP_URL,
      process.env.TUTURUUU_PAY_BASE_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://pay.tuturuuu.com'
        : getLocalInternalAppUrl('pay', 'http://localhost:7826'),
  });
}

/**
 * Absolute URL for a workspace's billing surface on pay.tuturuuu.com.
 * The pay proxy re-adds the locale segment, so callers pass an unlocalized
 * `/{wsId}/billing` path.
 */
export function getPayBillingUrl(wsId: string) {
  return `${getPayAppOrigin()}/${wsId}/billing`;
}
