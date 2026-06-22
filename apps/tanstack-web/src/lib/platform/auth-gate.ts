/**
 * Server-side auth gate for migrating auth-gated legacy routes into
 * apps/tanstack-web (TanStack Start).
 *
 * Fail-closed guarantee: every path through this module denies access by
 * default. The `resolveCurrentUser` server function NEVER throws and NEVER
 * returns an unauthenticated or empty profile — any error, non-2xx response,
 * or profile without a non-empty string `id` resolves to `null` (deny). Only a
 * fully-validated profile is treated as authenticated.
 *
 * Session resolution forwards the incoming request's auth (cookies / headers)
 * to internal-api `/api/v1/users/me/profile` via
 * `withForwardedInternalApiAuth(getRequestHeaders())`, so the gate trusts the
 * platform's existing session check rather than re-implementing it here.
 */

import { redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import {
  getCurrentUserProfile,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { defaultLocale } from './locale';

/**
 * Authenticated current-user profile shape, derived from the internal-api
 * `getCurrentUserProfile` return type. Derived (rather than imported by name)
 * because the concrete `CurrentUserProfile` type is not re-exported
 * from the `@tuturuuu/internal-api` package entrypoint.
 */
export type CurrentUserProfile = Awaited<
  ReturnType<typeof getCurrentUserProfile>
>;

/**
 * Builds a locale-prefixed login href with an encoded `nextUrl` return path.
 *
 * Open-redirect safe: `nextPath` is only honoured when it is a local path that
 * starts with a single `/` (not `//`, not a scheme like `https:`/`javascript:`,
 * no backslashes, no control characters). Anything else is coerced to `/` so an
 * attacker cannot bounce the user to an external origin after login.
 *
 * The `nextUrl` value is encoded exactly once via `encodeURIComponent`; callers
 * must pass a raw (un-encoded) path to avoid double-encoding.
 */
export function buildLoginRedirectHref(
  locale: string,
  nextPath: string
): string {
  const safeLocale =
    typeof locale === 'string' && locale.trim().length > 0
      ? locale.trim()
      : defaultLocale;

  const safeNextPath = toLocalRedirectPath(nextPath);

  return `/${safeLocale}/login?nextUrl=${encodeURIComponent(safeNextPath)}`;
}

/**
 * Fail-closed authentication check.
 *
 * Returns `true` ONLY when `profile` is a non-null object exposing a non-empty
 * string `id`. Everything else (`null`, `undefined`, `{}`, missing/empty/non
 * -string `id`, primitives) returns `false`.
 */
export function isAuthenticatedProfile(profile: unknown): boolean {
  if (typeof profile !== 'object' || profile === null) {
    return false;
  }

  const { id } = profile as { id?: unknown };

  return typeof id === 'string' && id.length > 0;
}

/**
 * Resolves the current user from the forwarded request auth.
 *
 * Fail-closed: this server function never throws. Any error or empty/
 * unauthenticated profile resolves to `null` (deny). Returns a fully-validated
 * `CurrentUserProfile` only when the caller is authenticated.
 */
export const resolveCurrentUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CurrentUserProfile | null> => {
    try {
      const profile = await getCurrentUserProfile(
        withForwardedInternalApiAuth(getRequestHeaders())
      );

      return isAuthenticatedProfile(profile)
        ? (profile as CurrentUserProfile)
        : null;
    } catch {
      return null;
    }
  }
);

/**
 * Loader convenience gate: returns the authenticated user, or throws a 307
 * redirect to the locale-prefixed login route with an encoded return path.
 *
 * The thrown `redirect(...)` is TanStack Start's control-flow object and must
 * be re-thrown (not returned), matching the route loader convention.
 */
export async function requireCurrentUser(args: {
  locale: string;
  nextPath: string;
}): Promise<CurrentUserProfile> {
  const user = await resolveCurrentUser();

  if (!user) {
    throw redirect({
      href: buildLoginRedirectHref(args.locale, args.nextPath),
      statusCode: 307,
    });
  }

  return user;
}

/**
 * Coerces an arbitrary value into a safe local redirect path. Returns the input
 * unchanged only when it is a single-slash-rooted local path free of scheme,
 * protocol-relative `//`, backslashes, and ASCII control characters; otherwise
 * returns `/`.
 */
function toLocalRedirectPath(nextPath: unknown): string {
  if (
    typeof nextPath !== 'string' ||
    !nextPath.startsWith('/') ||
    nextPath.startsWith('//') ||
    nextPath.includes('\\') ||
    hasAsciiControlCharacter(nextPath)
  ) {
    return '/';
  }

  return nextPath;
}

function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);

    if (charCode <= 0x1f || charCode === 0x7f) {
      return true;
    }
  }

  return false;
}
