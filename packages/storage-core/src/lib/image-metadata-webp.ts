import {
  ByteRanges,
  done,
  fourcc,
  type ImageMetadataStripResult,
  MALFORMED,
  MAX_REMOVED_BLOCKS,
} from './image-metadata-bytes';
import {
  buildOrientationTiff,
  isOrientationOnlyTiff,
  readExifOrientation,
} from './image-metadata-exif';

const KEPT_CHUNKS = new Set([
  'ALPH',
  'ANIM',
  'ANMF',
  'ICCP',
  'VP8 ',
  'VP8L',
  'VP8X',
]);
const IMAGE_CHUNKS = new Set(['ANMF', 'VP8 ', 'VP8L']);
const FRAME_CHUNKS = new Set(['ALPH', 'VP8 ', 'VP8L']);
const VP8X_BYTES = 10;
const ANMF_HEADER_BYTES = 16;
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

function chunk(type: string, data: Uint8Array) {
  const padded = data.length + (data.length & 1);
  const bytes = new Uint8Array(8 + padded);
  for (let index = 0; index < 4; index += 1) {
    bytes[index] = type.charCodeAt(index);
  }
  new DataView(bytes.buffer).setUint32(4, data.length, true);
  bytes.set(data, 8);
  return bytes;
}

/** True when an animation frame holds only image chunks. */
function isImageOnlyFrame(input: Uint8Array, start: number, end: number) {
  if (end - start < ANMF_HEADER_BYTES) return false;
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  let position = start + ANMF_HEADER_BYTES;
  let sawImage = false;
  while (position < end) {
    if (position + 8 > end) return false;
    const type = fourcc(input, position);
    const size = view.getUint32(position + 4, true);
    const next = position + 8 + size + (size & 1);
    if (!FRAME_CHUNKS.has(type) || next > end) return false;
    if (type !== 'ALPH') sawImage = true;
    position = next;
  }
  return sawImage;
}

export function stripWebp(input: Uint8Array): ImageMetadataStripResult {
  if (input.length < 12) return MALFORMED;
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const riffEnd = 8 + view.getUint32(4, true);
  if (riffEnd < 12 || riffEnd > input.length || riffEnd % 2 !== 0) {
    return MALFORMED;
  }

  const out = new ByteRanges(input);
  let vp8x: Uint8Array | null = null;
  let orientation: number | null = null;
  let hasOrientationBlock = false;
  let removed = riffEnd < input.length ? 1 : 0;
  let position = 12;
  let chunks = 0;
  let sawImage = false;

  while (position < riffEnd) {
    if (position + 8 > riffEnd) return MALFORMED;
    const type = fourcc(input, position);
    const size = view.getUint32(position + 4, true);
    const end = position + 8 + size + (size & 1);
    if (end > riffEnd) return MALFORMED;
    const data = input.subarray(position + 8, position + 8 + size);

    if (type === 'VP8X') {
      if (chunks > 0 || size !== VP8X_BYTES) return MALFORMED;
      vp8x = input.slice(position, end);
    } else if (type === 'ANMF' && !isImageOnlyFrame(input, position + 8, end)) {
      return MALFORMED;
    }
    chunks += 1;

    if (type === 'EXIF' && orientation === null) {
      orientation = readExifOrientation(data);
    }
    const orientationBlock =
      type === 'EXIF' && !hasOrientationBlock && isOrientationOnlyTiff(data);
    if (orientationBlock) hasOrientationBlock = true;
    if (IMAGE_CHUNKS.has(type)) sawImage = true;

    if (type === 'VP8X') {
      // Rewritten below once the kept chunks are known.
    } else if (orientationBlock || KEPT_CHUNKS.has(type)) {
      out.keep(position, end);
    } else if ((removed += 1) > MAX_REMOVED_BLOCKS) {
      return MALFORMED;
    }
    position = end;
  }

  if (!sawImage) return MALFORMED;

  const addsBlock =
    vp8x !== null &&
    !hasOrientationBlock &&
    orientation !== null &&
    orientation !== 1;
  const keepsExif = vp8x !== null && (hasOrientationBlock || addsBlock);
  return done(
    'webp',
    input,
    () => {
      if (addsBlock) {
        // libwebp stores the raw TIFF block without the `Exif\0\0` header.
        out.insert(chunk('EXIF', buildOrientationTiff(orientation!)));
      }
      const body = out.bytes();
      const header = vp8x?.slice() ?? new Uint8Array();
      if (vp8x) {
        header[8] =
          header[8]! & ~VP8X_XMP_FLAG & (keepsExif ? 0xff : ~VP8X_EXIF_FLAG);
      }
      const output = new Uint8Array(12 + header.length + body.length);
      output.set(input.subarray(0, 12));
      new DataView(output.buffer).setUint32(4, output.length - 8, true);
      output.set(header, 12);
      output.set(body, 12 + header.length);
      return output;
    },
    removed
  );
}
