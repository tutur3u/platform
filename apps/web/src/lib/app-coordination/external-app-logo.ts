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

export type ExternalAppLogo = { body: Uint8Array; contentType: string };

/** The login's same-origin path for a registered app's logo. */
export function externalAppLogoPath(appId: string) {
  return `/api/v1/auth/external-app-logo/${encodeURIComponent(appId)}`;
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
