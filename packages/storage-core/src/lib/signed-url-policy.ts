/**
 * Lifetime policy for signed storage URLs issued by app-side signers.
 *
 * Signed URLs are bearer tokens that cannot be revoked before they expire, so
 * new URLs default to one hour and no app-side signer issues more than seven
 * days. Anything that must stay readable longer persists the object path and
 * signs on read (for example through the workspace share redirect route).
 */

export const MIN_SIGNED_URL_TTL_SECONDS = 60;
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Clamps a requested lifetime into [1 minute, 7 days]; defaults to 1 hour. */
export function clampSignedUrlTtl(
  expiresIn: number | null | undefined,
  fallback: number = DEFAULT_SIGNED_URL_TTL_SECONDS
): number {
  const requested =
    typeof expiresIn === 'number' && Number.isFinite(expiresIn)
      ? Math.trunc(expiresIn)
      : fallback;
  return Math.min(
    MAX_SIGNED_URL_TTL_SECONDS,
    Math.max(MIN_SIGNED_URL_TTL_SECONDS, requested)
  );
}

/** Stable sign-on-read URL for a workspace object (redirects to a fresh URL). */
export function buildWorkspaceStorageShareUrl(
  wsId: string,
  path: string
): string {
  const query = new URLSearchParams({ path });
  return `/api/v1/workspaces/${encodeURIComponent(wsId)}/storage/share?${query.toString()}`;
}

/**
 * Extracts `{ bucket, path }` from a Supabase Storage signed object URL
 * (`.../storage/v1/object/sign/<bucket>/<path>?token=...`), or returns null.
 */
export function parseSupabaseSignedObjectUrl(
  value: string
): { bucket: string; path: string } | null {
  // URL parsing normalizes dot segments (including `%2e%2e`), which would
  // erase traversal; reject them on the raw string first.
  if (/(?:^|\/)(?:\.|%2e){1,2}(?=\/|\?|#|$)/i.test(value.split('?')[0] ?? '')) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const prefix = '/storage/v1/object/sign/';
  if (!url.pathname.startsWith(prefix) || !url.searchParams.has('token')) {
    return null;
  }
  const [bucket, ...rest] = url.pathname.slice(prefix.length).split('/');
  if (!bucket || rest.length === 0) return null;
  try {
    const path = rest.map((segment) => decodeURIComponent(segment)).join('/');
    if (path.split('/').some((s) => s === '' || s === '.' || s === '..')) {
      return null;
    }
    return { bucket: decodeURIComponent(bucket), path };
  } catch {
    return null;
  }
}

const WORKSPACE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Keeps previously stored signed URLs readable: a signed `workspaces` URL
 * (`<wsId>/<path>`) becomes the stable sign-on-read share URL for that object.
 * The share route re-checks the reader's access on every request. Anything
 * else is returned unchanged.
 */
export function resolveStoredWorkspaceStorageUrl(value: string): string {
  const parsed = parseSupabaseSignedObjectUrl(value);
  if (parsed?.bucket !== 'workspaces') return value;
  const [wsId, ...rest] = parsed.path.split('/');
  if (!wsId || !WORKSPACE_ID_PATTERN.test(wsId) || rest.length === 0) {
    return value;
  }
  return buildWorkspaceStorageShareUrl(wsId, rest.join('/'));
}
