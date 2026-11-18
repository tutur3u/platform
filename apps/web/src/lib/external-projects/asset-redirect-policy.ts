/**
 * Which `source_url` values the CMS asset route may redirect to.
 *
 * `/assets/{id}` is public for published entries, so redirecting to whatever a
 * manager stored would make it an open redirect on the platform origin. Only
 * storage object paths on the platform's own storage origins qualify, the same
 * origins the storage download tickets accept. Other origin paths (for
 * example GoTrue's `/auth/v1/verify?redirect_to=`) would chain into another
 * redirect, and a signed URL's `token` is a bearer credential that must not be
 * handed out from a public route. Refused sources are served from the asset's
 * stored object when it has one.
 */

/** Storage object and image-render paths, the only redirectable paths. */
export const STORAGE_OBJECT_PATH_PATTERN =
  /^\/storage\/v1\/(?:object|render\/image)\//u;

function readOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function getPlatformAssetRedirectOrigins() {
  return [
    readOrigin(process.env.SUPABASE_SERVER_URL),
    readOrigin(process.env[`${'NEXT_PUBLIC'}_SUPABASE_URL`]),
  ].filter((origin): origin is string => Boolean(origin));
}

/** The parsed URL when it may be a redirect target, otherwise null. */
export function resolveAllowedAssetRedirectUrl(value: string) {
  let url: URL;
  try {
    // No base: relative and protocol-relative values do not parse.
    url = new URL(value);
  } catch {
    return null;
  }

  // Local Supabase serves plain HTTP; nothing else may downgrade.
  const allowsHttp = process.env.NODE_ENV === 'development';
  if (url.protocol !== 'https:' && !(allowsHttp && url.protocol === 'http:')) {
    return null;
  }
  if (url.username || url.password) return null;
  // The origin comparison is exact: scheme, host and port.
  if (!getPlatformAssetRedirectOrigins().includes(url.origin)) return null;
  // Parsing already resolved dot segments, so the prefix cannot be escaped.
  if (!STORAGE_OBJECT_PATH_PATTERN.test(url.pathname)) return null;
  // Encoded separators could be decoded into another path further along.
  if (/%2f|%5c/iu.test(url.pathname)) return null;
  if (
    [...url.searchParams.keys()].some((key) => key.toLowerCase() === 'token')
  ) {
    return null;
  }

  return url;
}
