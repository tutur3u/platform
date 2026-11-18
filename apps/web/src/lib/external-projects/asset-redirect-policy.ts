/**
 * Which `source_url` values the CMS asset route may redirect to.
 *
 * `/assets/{id}` is public for published entries, so redirecting to whatever a
 * manager stored would make it an open redirect on the platform origin. Only
 * the platform's own storage origins qualify, the same origins the storage
 * download tickets accept; other sources are served from their URL in the
 * delivery payload or imported into workspace storage.
 */

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

  return getPlatformAssetRedirectOrigins().includes(url.origin) ? url : null;
}
