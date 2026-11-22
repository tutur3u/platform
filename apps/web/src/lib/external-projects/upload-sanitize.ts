import {
  sniffImageFormat,
  stripImageMetadata,
} from '@tuturuuu/storage-core/image-metadata-strip';
import { assetBytesDigest } from './asset-publication-bytes';

const IMAGE_EXTENSIONS = new Set([
  'apng',
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'ico',
  'jfif',
  'jpe',
  'jpeg',
  'jpg',
  'pjp',
  'pjpeg',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp',
]);

export const MALFORMED_IMAGE_MESSAGE =
  'This image could not be processed. Export it again and retry the upload.';

/**
 * Whether a signed (direct-to-storage) upload could carry an image, judged
 * by its declared type or its file extension. Signed uploads skip metadata
 * stripping, and browsers render image bytes whatever the label, so these
 * must never replace an object in place.
 */
export function mayCarryImage({
  contentType,
  filename,
}: {
  contentType?: string | null;
  filename?: string | null;
}) {
  const type = contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  const extension = filename?.split('.').pop()?.trim().toLowerCase() ?? '';
  return type.startsWith('image/') || IMAGE_EXTENSIONS.has(extension);
}

export type SanitizedExternalProjectUpload =
  | {
      ok: true;
      bytes: Uint8Array;
      contentSha256: string;
      metadataStripped: boolean;
    }
  | { ok: false; reason: 'malformed_image' };

/**
 * Removes EXIF (including GPS), XMP, IPTC and text metadata from JPEG, PNG
 * and WebP uploads before they are stored, and hashes the stored bytes. The
 * format comes from the bytes, whatever type the client declared. The
 * container is rewritten without decoding pixels; colour profiles and
 * orientation are kept. Bytes that look like one of these formats but do not
 * parse are refused, so a damaged or crafted file cannot slip through with
 * its metadata. Other formats are stored as received.
 */
export function sanitizeExternalProjectUpload(
  input: Uint8Array
): SanitizedExternalProjectUpload {
  let bytes = input;
  let metadataStripped = false;
  const sniffed = sniffImageFormat(input);

  if (sniffed && sniffed !== 'gif') {
    const result = stripImageMetadata(input);
    if (!result.ok) {
      console.warn('External project upload image refused', {
        format: sniffed,
        reason: result.reason,
      });
      return { ok: false, reason: 'malformed_image' };
    }
    bytes = result.bytes;
    metadataStripped = result.changed;
  }

  return {
    ok: true,
    bytes,
    contentSha256: assetBytesDigest(bytes),
    metadataStripped,
  };
}
