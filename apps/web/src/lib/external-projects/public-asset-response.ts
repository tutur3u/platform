import type { ImageTransformOptions } from '@tuturuuu/types';
import { getImageTransformer } from '../image-transform';
import { sliceByteRange } from './asset-byte-range';
import { PUBLIC_ASSET_MAX_BYTES } from './asset-publication-bytes';
import { cachedVerifiedAsset } from './verified-asset-cache';

const inlineAssetType =
  /^(?:image\/(?:avif|bmp|gif|jpeg|png|svg\+xml|webp|x-icon)|audio\/(?:aac|mpeg|ogg|wav|webm)|video\/(?:mp4|ogg|webm))$/i;

export async function publicExternalProjectAssetResponse(
  object: { buffer: Buffer; contentType: string | null },
  transform: ImageTransformOptions | undefined,
  headers: HeadersInit,
  requestedRange: string | null,
  cacheKey: string
) {
  let { buffer, contentType } = object;
  if (transform && (transform.width || transform.height)) {
    const rendered = await cachedVerifiedAsset(
      `${cacheKey}/variant/${JSON.stringify(transform)}`,
      async () => {
        const adapter = await getImageTransformer();
        const image = adapter.decode(object.buffer, {
          limitInputPixels: 16_000_000,
          failOn: 'warning',
          pages: 1,
        });
        try {
          if (((await image.metadata()).pages ?? 1) > 1) return null;
          const resized = await image.webp({
            width: transform.width ?? transform.height ?? 1200,
            height: transform.height ?? transform.width ?? 1200,
            quality: transform.quality ?? 82,
            effort: 4,
          });
          return resized.byteLength <= PUBLIC_ASSET_MAX_BYTES
            ? { buffer: resized, contentType: 'image/webp' }
            : null;
        } finally {
          image.destroy();
        }
      }
    );
    if (!rendered) return null;
    ({ buffer, contentType } = rendered);
  }
  if (buffer.byteLength > PUBLIC_ASSET_MAX_BYTES) return null;
  const mime = contentType?.split(';', 1)[0]?.trim() ?? '';
  const responseHeaders = new Headers(headers);
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Content-Security-Policy', "sandbox; default-src 'none'");
  if (inlineAssetType.test(mime)) responseHeaders.set('Content-Type', mime);
  else {
    responseHeaders.set('Content-Type', 'application/octet-stream');
    responseHeaders.set('Content-Disposition', 'attachment');
  }

  let body: Uint8Array = buffer;
  let status = 200;
  if (!transform) {
    const sliced = sliceByteRange(buffer, requestedRange, responseHeaders);
    if (sliced.status === 416)
      return new Response(null, { status: 416, headers: responseHeaders });
    body = sliced.body;
    status = sliced.status;
    responseHeaders.set('Accept-Ranges', 'bytes');
  }
  return new Response(new Uint8Array(body), {
    status,
    headers: responseHeaders,
  });
}
