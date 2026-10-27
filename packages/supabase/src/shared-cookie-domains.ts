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

export function getTuturuuuSharedCookieDomains(): readonly TuturuuuSharedCookieDomain[] {
  const normalized =
    process.env.NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN?.trim().toLowerCase();
  const accepted = CONFIGURED_SHARED_COOKIE_DOMAINS.find(
    (domain) => domain === normalized
  );

  return accepted
    ? [
        { cookieDomain: accepted, hostname: accepted.slice(1), secure: true },
        ...TUTURUUU_SHARED_COOKIE_DOMAINS.slice(1),
      ]
    : TUTURUUU_SHARED_COOKIE_DOMAINS;
}
