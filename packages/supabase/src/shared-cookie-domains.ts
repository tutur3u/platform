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

/**
 * Server code reads `VERCEL_ENV`; browser bundles cannot see it, so they fall
 * back to `NEXT_PUBLIC_VERCEL_ENV` when it is exposed to the client.
 */
function isProductionDeployment() {
  return (
    process.env.VERCEL_ENV === 'production' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
  );
}

export function getTuturuuuSharedCookieDomains(): readonly TuturuuuSharedCookieDomain[] {
  const normalized =
    process.env.NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN?.trim().toLowerCase();
  const ignoredOnProduction = Boolean(normalized) && isProductionDeployment();

  if (ignoredOnProduction && !productionOverrideErrorLogged) {
    productionOverrideErrorLogged = true;
    console.error(
      '[shared-cookie] Ignoring NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN on a production deployment; it must never be set on production'
    );
  }

  const accepted = ignoredOnProduction
    ? undefined
    : CONFIGURED_SHARED_COOKIE_DOMAINS.find((domain) => domain === normalized);

  return accepted
    ? [
        { cookieDomain: accepted, hostname: accepted.slice(1), secure: true },
        ...TUTURUUU_SHARED_COOKIE_DOMAINS.slice(1),
      ]
    : TUTURUUU_SHARED_COOKIE_DOMAINS;
}
