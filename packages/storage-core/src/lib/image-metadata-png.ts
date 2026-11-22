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
  readTiffOrientation,
} from './image-metadata-exif';

const CRITICAL_CHUNKS = new Set(['IDAT', 'IEND', 'IHDR', 'PLTE']);

/**
 * Ancillary chunks that carry colour, transparency or animation data only.
 * Text, time, `eXIf` and named palettes (`sPLT`) are dropped. A size of null
 * means the length varies with the image.
 */
const KEPT_ANCILLARY = new Map<string, number | null>([
  ['acTL', 8],
  ['bKGD', null],
  ['cHRM', 32],
  ['cICP', 4],
  ['cLLI', 8],
  ['cLLi', 8],
  ['fcTL', 26],
  ['fdAT', null],
  ['gAMA', 4],
  ['hIST', null],
  ['iCCP', null],
  ['mDCV', 24],
  ['mDCv', 24],
  ['pHYs', 9],
  ['sBIT', null],
  ['sRGB', 1],
  ['tRNS', null],
]);

const FIXED_CRITICAL_SIZES = new Map([
  ['IEND', 0],
  ['IHDR', 13],
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index += 1) {
    chunk[4 + index] = type.charCodeAt(index);
  }
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

function isChunkType(type: string) {
  return /^[A-Za-z]{4}$/.test(type);
}

export function stripPng(input: Uint8Array): ImageMetadataStripResult {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const out = new ByteRanges(input);
  out.keep(0, 8);
  let insertAt = -1;
  let orientation: number | null = null;
  let hasOrientationBlock = false;
  let removed = 0;
  let position = 8;
  let sawEnd = false;

  while (position < input.length) {
    if (position + 12 > input.length) return MALFORMED;
    const length = view.getUint32(position);
    const type = fourcc(input, position + 4);
    const end = position + 12 + length;
    if (length > 0x7fffffff || !isChunkType(type) || end > input.length) {
      return MALFORMED;
    }
    if (position === 8 && type !== 'IHDR') return MALFORMED;

    const data = input.subarray(position + 8, position + 8 + length);
    const critical = type.charCodeAt(0) < 0x61;
    if (critical) {
      // An unknown critical chunk cannot be decoded safely or dropped.
      if (!CRITICAL_CHUNKS.has(type)) return MALFORMED;
      const size = FIXED_CRITICAL_SIZES.get(type);
      if (size !== undefined && length !== size) return MALFORMED;
    }

    if (type === 'eXIf' && orientation === null) {
      orientation = readTiffOrientation(data);
    }
    const orientationBlock =
      type === 'eXIf' && !hasOrientationBlock && isOrientationOnlyTiff(data);
    if (orientationBlock) hasOrientationBlock = true;

    const keptSize = KEPT_ANCILLARY.get(type);
    const keptAncillary =
      keptSize !== undefined && (keptSize === null || keptSize === length);
    if (orientationBlock || critical || keptAncillary) {
      out.keep(position, end);
    } else if ((removed += 1) > MAX_REMOVED_BLOCKS) {
      return MALFORMED;
    }
    if (type === 'IHDR') insertAt = out.mark();

    position = end;
    if (type === 'IEND') {
      sawEnd = true;
      if (position < input.length) removed += 1;
      break;
    }
  }

  if (!sawEnd) return MALFORMED;
  if (
    removed > 0 &&
    !hasOrientationBlock &&
    orientation !== null &&
    orientation !== 1
  ) {
    // eXIf must precede IDAT; directly after IHDR is always valid.
    out.insertAt(insertAt, pngChunk('eXIf', buildOrientationTiff(orientation)));
  }
  return done('png', input, () => out.bytes(), removed);
}
