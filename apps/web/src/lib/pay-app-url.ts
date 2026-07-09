import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

/**
 * Rollout gate for the pay.tuturuuu.com billing surface.
 *
 * While this is `false` (the default), web keeps serving billing itself so
 * nothing breaks before the pay app is deployed. Flip
 * `NEXT_PUBLIC_ENABLE_PAY_APP=true` only after apps/pay is live to redirect
 * web's `/billing` route and settings entry point over to pay. Both the
 * default-off value and the flag are readable on the server and the client
 * because it is a `NEXT_PUBLIC_` variable inlined at build time.
 */
export function isPayRolloutEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_PAY_APP === 'true';
}

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
