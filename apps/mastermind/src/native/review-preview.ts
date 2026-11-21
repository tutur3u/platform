import {
  FLEET_REVIEW_IMAGE_MAX_BYTES,
  type FleetReview,
  safeReviewImageUrl,
  sniffReviewImage,
} from '../fleet/contract';
import type { Owner } from './auth';

const ASSETS = 'https://tuturuuu.com/api/v1/mastermind/fleet/review-assets';

/**
 * A design review's preview as a data URL the page can show under its
 * `img-src 'self' data:` policy, or null. The source comes only from the
 * validated snapshot: an uploaded asset is read with the owner's bearer, a
 * first-party hosted image without any credential. Both refuse redirects,
 * stop past the size cap and must carry a PNG, JPEG or WebP signature.
 */
export async function fetchReviewPreview(
  owner: Owner,
  review: FleetReview,
  fetcher: typeof fetch = fetch
): Promise<string | null> {
  const preview = review.preview;
  if (!preview) return null;
  let request: Request;
  if (preview.source === 'asset') {
    request = new Request(`${ASSETS}/${preview.assetId}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
  } else {
    const url = safeReviewImageUrl(preview.url);
    if (!url) return null;
    request = new Request(url, {
      redirect: 'manual',
      credentials: 'omit',
      signal: AbortSignal.timeout(8_000),
    });
  }
  try {
    const response = await fetcher(request);
    if (!response.ok || response.status !== 200 || !response.body) return null;
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > FLEET_REVIEW_IMAGE_MAX_BYTES) return null;
    const bytes = await readCapped(response.body);
    if (!bytes) return null;
    const type = sniffReviewImage(bytes);
    if (!type || (preview.source === 'asset' && type !== preview.contentType))
      return null;
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}

async function readCapped(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > FLEET_REVIEW_IMAGE_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return total ? bytes : null;
}
