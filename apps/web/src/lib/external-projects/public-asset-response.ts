import type { ImageTransformOptions } from '@tuturuuu/types';
import { getImageTransformer } from '../image-transform';
import { PUBLIC_ASSET_MAX_BYTES } from './asset-publication-bytes';

const inlineAssetType =
  /^(?:image\/(?:avif|bmp|gif|jpeg|png|svg\+xml|webp|x-icon)|audio\/(?:aac|mpeg|ogg|wav|webm)|video\/(?:mp4|ogg|webm))$/i;

export async function publicExternalProjectAssetResponse(
  object: { buffer: Buffer; contentType: string | null },
  transform: ImageTransformOptions | undefined,
  headers: HeadersInit,
  requestedRange: string | null
) {
  let { buffer, contentType } = object;
  if (transform && (transform.width || transform.height)) {
    const adapter = await getImageTransformer();
    const image = adapter.decode(buffer, {
      limitInputPixels: 16_000_000,
      failOn: 'warning',
      pages: 1,
    });
    try {
      const metadata = await image.metadata();
      if ((metadata.pages ?? 1) > 1) return null;
      buffer = await image.webp({
        width: transform.width ?? transform.height ?? 1200,
        height: transform.height ?? transform.width ?? 1200,
        quality: transform.quality ?? 82,
        effort: 4,
      });
      contentType = 'image/webp';
    } finally {
      image.destroy();
    }
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

  const range =
    !transform && /^bytes=(\d{0,16})-(\d{0,16})$/.exec(requestedRange ?? '');
  let status = 200;
  if (range && (range[1] || range[2])) {
    const length = buffer.byteLength;
    const start = range[1]
      ? Number(range[1])
      : Math.max(0, length - Number(range[2]));
    const end =
      range[1] && range[2]
        ? Math.min(length - 1, Number(range[2]))
        : length - 1;
    if (start >= length || end < start) {
      responseHeaders.set('Content-Range', `bytes */${length}`);
      return new Response(null, { status: 416, headers: responseHeaders });
    }
    responseHeaders.set('Content-Range', `bytes ${start}-${end}/${length}`);
    buffer = buffer.subarray(start, end + 1);
    status = 206;
  }
  if (!transform) responseHeaders.set('Accept-Ranges', 'bytes');
  return new Response(new Uint8Array(buffer), {
    status,
    headers: responseHeaders,
  });
}
