import { parseExternalAppLogoUrl } from '@tuturuuu/utils/external-app-registry-policy';

/** Raster types only: an SVG served from our origin could carry script. */
export const EXTERNAL_APP_LOGO_TYPES = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const EXTERNAL_APP_LOGO_MAX_BYTES = 512 * 1024;
export const EXTERNAL_APP_LOGO_TIMEOUT_MS = 3000;
export const EXTERNAL_APP_LOGO_HIT_TTL_MS = 6 * 60 * 60 * 1000;
export const EXTERNAL_APP_LOGO_MISS_TTL_MS = 5 * 60 * 1000;
const EXTERNAL_APP_LOGO_CACHE_ENTRIES = 64;

export type ExternalAppLogo = {
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
};

/**
 * A short digest of the logo URL. It versions the proxy path, so a changed
 * logo gets a new URL and every other version is refused without a fetch.
 */
export async function externalAppLogoVersion(logoUrl: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(logoUrl)
  );
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** The login's same-origin, versioned path for a registered app's logo. */
export async function externalAppLogoPath(appId: string, logoUrl: string) {
  return `/api/v1/auth/external-app-logo/${encodeURIComponent(appId)}/${await externalAppLogoVersion(logoUrl)}`;
}

async function readCapped(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > EXTERNAL_APP_LOGO_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/**
 * Fetches a registered logo once, bounded: a public https URL only, no
 * redirects, one attempt with a timeout, a raster image type and a size cap.
 * Any failure returns null, and the sign-in screen shows its neutral glyph.
 */
export async function fetchExternalAppLogo(
  logoUrl: string | null | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<ExternalAppLogo | null> {
  const url = parseExternalAppLogoUrl(logoUrl);
  if (!url) return null;

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: EXTERNAL_APP_LOGO_TYPES.join(', ') },
      redirect: 'manual',
      signal: AbortSignal.timeout(EXTERNAL_APP_LOGO_TIMEOUT_MS),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return null;
    }

    const contentType = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      ?.trim()
      .toLowerCase();
    const declaredLength = Number(response.headers.get('content-length'));
    if (
      !contentType ||
      !(EXTERNAL_APP_LOGO_TYPES as readonly string[]).includes(contentType) ||
      declaredLength > EXTERNAL_APP_LOGO_MAX_BYTES
    ) {
      await response.body?.cancel();
      return null;
    }

    const body = await readCapped(response);
    return body?.byteLength ? { body, contentType } : null;
  } catch {
    return null;
  }
}

type CacheEntry = {
  expiresAt: number;
  logo: Promise<ExternalAppLogo | null>;
};
const logoCache = new Map<string, CacheEntry>();

/**
 * One upstream fetch per logo URL per isolate per TTL: hits are kept for
 * hours, misses for minutes, concurrent requests share one in-flight fetch,
 * and the cache holds a bounded number of entries. Callers cannot widen the
 * key, which is the registered URL, not anything in the request.
 */
export function getCachedExternalAppLogo(
  logoUrl: string,
  {
    fetchImpl = fetch,
    now = Date.now(),
  }: { fetchImpl?: typeof fetch; now?: number } = {}
) {
  const cached = logoCache.get(logoUrl);
  if (cached && cached.expiresAt > now) return cached.logo;

  const logo = fetchExternalAppLogo(logoUrl, fetchImpl);
  const entry: CacheEntry = {
    expiresAt: now + EXTERNAL_APP_LOGO_MISS_TTL_MS,
    logo,
  };
  logoCache.delete(logoUrl);
  logoCache.set(logoUrl, entry);
  while (logoCache.size > EXTERNAL_APP_LOGO_CACHE_ENTRIES) {
    const oldest = logoCache.keys().next().value;
    if (oldest === undefined) break;
    logoCache.delete(oldest);
  }
  void logo.then((result) => {
    if (result) entry.expiresAt = now + EXTERNAL_APP_LOGO_HIT_TTL_MS;
  });
  return logo;
}

/** Test seam: forget every cached logo. */
export function clearExternalAppLogoCache() {
  logoCache.clear();
}
