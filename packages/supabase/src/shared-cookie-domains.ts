export interface TuturuuuSharedCookieDomain {
  cookieDomain: string;
  hostname: string;
  secure: boolean;
}

/**
 * Dependency-free mirror of the shared cookie domain configuration in
 * `@tuturuuu/utils/shared-cookie`. `@tuturuuu/utils` depends on this package,
 * so the Supabase cookie helpers cannot import it without a package cycle; the
 * parity test in `packages/utils/src/shared-cookie.test.ts` fails if the two
 * ever disagree. Keep both in sync.
 */
export const TUTURUUU_SHARED_COOKIE_DOMAINS = [
  {
    cookieDomain: '.tuturuuu.com',
    hostname: 'tuturuuu.com',
    secure: true,
  },
  {
    cookieDomain: '.tuturuuu.localhost',
    hostname: 'tuturuuu.localhost',
    secure: false,
  },
] as const satisfies readonly TuturuuuSharedCookieDomain[];

/** Exact allowlist for `NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN`. */
export const CONFIGURED_SHARED_COOKIE_DOMAINS = [
  '.staging.tutur3u.com',
] as const;

let productionOverrideErrorLogged = false;

/** Test-only: lets the once-per-process production error log fire again. */
export function resetProductionOverrideErrorLogForTests() {
  productionOverrideErrorLogged = false;
}

function isProductionAppUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const { hostname } = new URL(value);
    return hostname === 'tuturuuu.com' || hostname.endsWith('.tuturuuu.com');
  } catch {
    return false;
  }
}

/**
 * Production on any runtime, so the shared cookie override fails closed the
 * same way on Vercel and on Cloudflare Workers:
 * - `TUTURUUU_DEPLOY_ENV=production`, the explicit runtime-neutral marker;
 * - `VERCEL_ENV` / `NEXT_PUBLIC_VERCEL_ENV=production` on Vercel;
 * - `PLATFORM_BUILD_ENVIRONMENT=production`, which the Cloudflare Worker
 *   publishers set for production builds;
 * - a production app origin in `NEXT_PUBLIC_APP_URL`, which every canonical
 *   production Worker carries in its vars (Workers have no Vercel marker).
 */
export function isProductionDeployment() {
  return (
    process.env.TUTURUUU_DEPLOY_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ||
    process.env.PLATFORM_BUILD_ENVIRONMENT === 'production' ||
    isProductionAppUrl(process.env.NEXT_PUBLIC_APP_URL)
  );
}

/** One policy for server runtime admission and the build-inlined browser signal. */
export function isStagingSharedCookieDeployment(domain: string | undefined) {
  const deployEnv = process.env.TUTURUUU_DEPLOY_ENV;
  if (
    process.env.NEXT_PUBLIC_TUTURUUU_STAGING === '1' &&
    deployEnv !== undefined &&
    deployEnv !== 'staging'
  ) {
    throw new Error('Public staging signal conflicts with TUTURUUU_DEPLOY_ENV');
  }
  const production = isProductionDeployment();
  const staging =
    deployEnv === 'staging' ||
    (deployEnv === undefined &&
      process.env.NEXT_PUBLIC_TUTURUUU_STAGING === '1');

  if (deployEnv === 'staging' && production) {
    throw new Error('Staging cannot use a production runtime');
  }
  if (production) return false;
  if (staging && domain !== '.staging.tutur3u.com') {
    throw new Error('Staging requires the staging shared cookie domain');
  }
  return staging;
}

export function getTuturuuuSharedCookieDomains(): readonly TuturuuuSharedCookieDomain[] {
  const normalized =
    process.env.NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN?.trim().toLowerCase();
  const staging = isStagingSharedCookieDeployment(normalized);

  const ignoredOnProduction = Boolean(normalized) && isProductionDeployment();

  if (ignoredOnProduction && !productionOverrideErrorLogged) {
    productionOverrideErrorLogged = true;
    console.error(
      '[shared-cookie] Ignoring NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN on a production deployment; it must never be set on production'
    );
  }

  const accepted =
    ignoredOnProduction || !staging
      ? undefined
      : CONFIGURED_SHARED_COOKIE_DOMAINS.find(
          (domain) => domain === normalized
        );

  return accepted
    ? [
        { cookieDomain: accepted, hostname: accepted.slice(1), secure: true },
        ...TUTURUUU_SHARED_COOKIE_DOMAINS.slice(1),
      ]
    : TUTURUUU_SHARED_COOKIE_DOMAINS;
}
