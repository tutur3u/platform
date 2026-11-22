/**
 * Lossless metadata stripping for uploaded JPEG, PNG and WebP images.
 *
 * Walks the container once and keeps only allowlisted structure: EXIF
 * (including GPS), XMP, IPTC, MPF previews, comments, text chunks, JFIF
 * thumbnails and trailing bytes are removed without decoding pixels. Colour
 * data (ICC profiles, the Adobe colour header, gamma/chromaticity chunks) is
 * kept. A non-default EXIF orientation is preserved in a replacement block
 * that holds only the Orientation tag, so images still display upright.
 *
 * Untrusted input: every length is bounds-checked, work and output pieces
 * are bounded, and any inconsistency returns `{ ok: false, reason:
 * 'malformed' }` instead of throwing.
 * Framework-independent; no Node, Next.js or Workers imports.
 */

import { fourcc, type ImageMetadataStripResult } from './image-metadata-bytes';
import { startsWithBytes } from './image-metadata-exif';
import { stripJpeg } from './image-metadata-jpeg';
import { stripPng } from './image-metadata-png';
import { stripWebp } from './image-metadata-webp';

export type {
  ImageMetadataStripResult,
  StrippableImageFormat,
} from './image-metadata-bytes';

export type SniffedImageFormat = 'jpeg' | 'png' | 'webp' | 'gif';

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

export function sniffImageFormat(input: Uint8Array): SniffedImageFormat | null {
  // Any SOI is a JPEG candidate; one that does not parse is refused rather
  // than stored with its metadata.
  if (input[0] === 0xff && input[1] === 0xd8) return 'jpeg';
  if (startsWithBytes(input, PNG_SIGNATURE)) return 'png';
  if (fourcc(input, 0) === 'RIFF' && fourcc(input, 8) === 'WEBP') {
    return 'webp';
  }
  if (fourcc(input, 0) === 'GIF8') return 'gif';
  return null;
}

export function stripImageMetadata(
  input: Uint8Array
): ImageMetadataStripResult {
  const format = sniffImageFormat(input);
  if (format === 'jpeg') return stripJpeg(input);
  if (format === 'png') return stripPng(input);
  if (format === 'webp') return stripWebp(input);
  return { ok: false, reason: 'unsupported' };
}
