import {
  ByteRanges,
  concat,
  done,
  type ImageMetadataStripResult,
  MALFORMED,
  MAX_REMOVED_BLOCKS,
} from './image-metadata-bytes';
import {
  buildOrientationTiff,
  EXIF_HEADER,
  isOrientationOnlyExif,
  readExifOrientation,
  startsWithBytes,
} from './image-metadata-exif';

const JFIF = new TextEncoder().encode('JFIF\0');
const ICC_PROFILE = new TextEncoder().encode('ICC_PROFILE\0');
const ADOBE = new TextEncoder().encode('Adobe');
/** `JFIF\0`, version, units, densities and an empty thumbnail size. */
const JFIF_HEADER_BYTES = 14;
/** `Adobe`, DCTEncodeVersion, APP14Flags0/1 and ColorTransform. */
const ADOBE_HEADER_BYTES = 12;
/** Restart interval (DRI) payload: one 16-bit value. */
const DRI_PAYLOAD_BYTES = 2;
/** Segments outside scans; real files carry tens, progressive ones hundreds. */
const MAX_SEGMENTS = 65_536;

// Frame, table and scan markers that carry image structure only. DRI is
// handled separately because its payload has a fixed size.
const STRUCTURAL_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcc, 0xcd,
  0xce, 0xcf, 0xda, 0xdb, 0xdc, 0xde, 0xdf,
]);

type SegmentAction = 'keep' | 'drop' | 'reject' | Uint8Array;

/**
 * Allowlist: structural markers, a fixed-size DRI, the JFIF header without
 * its thumbnail, ICC profiles and the fixed Adobe colour header. Every other
 * APPn (EXIF, XMP, IPTC, MPF previews, vendor blocks) and COM is dropped.
 * JPEG extension markers (JPG, JPGn) are rejected because their payload
 * meaning is unknown.
 */
function segmentAction(marker: number, payload: Uint8Array): SegmentAction {
  if (STRUCTURAL_MARKERS.has(marker)) return 'keep';
  if (marker === 0xdd) {
    return payload.length === DRI_PAYLOAD_BYTES ? 'keep' : 'reject';
  }
  if (marker === 0xe0) {
    if (!startsWithBytes(payload, JFIF)) return 'drop';
    return fixedHeader(payload, JFIF_HEADER_BYTES, (header) => {
      header[12] = 0; // thumbnail width
      header[13] = 0; // thumbnail height
    });
  }
  if (marker === 0xe2) {
    return startsWithBytes(payload, ICC_PROFILE) ? 'keep' : 'drop';
  }
  if (marker === 0xee) {
    if (!startsWithBytes(payload, ADOBE)) return 'drop';
    return fixedHeader(payload, ADOBE_HEADER_BYTES);
  }
  if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) return 'drop';
  return 'reject';
}

/** Keeps a fixed-size header and drops whatever follows it. */
function fixedHeader(
  payload: Uint8Array,
  size: number,
  edit?: (header: Uint8Array) => void
): SegmentAction {
  if (payload.length < size) return 'drop';
  const header = payload.slice(0, size);
  edit?.(header);
  if (payload.length === size && startsWithBytes(payload, header)) {
    return 'keep';
  }
  return header;
}

function segment(marker: number, payload: Uint8Array) {
  const length = payload.length + 2;
  return concat([
    Uint8Array.of(0xff, marker, length >> 8, length & 0xff),
    payload,
  ]);
}

/** Index of the first marker after the entropy-coded data at `start`. */
function scanEntropyData(input: Uint8Array, start: number) {
  let index = start;
  while (index < input.length) {
    if (input[index] !== 0xff) {
      index += 1;
      continue;
    }
    const next = input[index + 1];
    if (next === undefined) return input.length;
    if (next === 0x00 || (next >= 0xd0 && next <= 0xd7) || next === 0xff) {
      index += next === 0xff ? 1 : 2;
      continue;
    }
    return index;
  }
  return input.length;
}

export function stripJpeg(input: Uint8Array): ImageMetadataStripResult {
  const out = new ByteRanges(input);
  out.keep(0, 2);
  let insertAt = out.mark();
  let keptSegments = 0;
  let orientation: number | null = null;
  let hasOrientationBlock = false;
  let removed = 0;
  let position = 2;
  let segments = 0;
  let sawScan = false;
  let sawEnd = false;

  while (position < input.length) {
    if (input[position] !== 0xff) return MALFORMED;
    let markerAt = position + 1;
    while (input[markerAt] === 0xff) markerAt += 1; // fill bytes
    const marker = input[markerAt];
    if (marker === undefined) return MALFORMED;
    if (markerAt > position + 1) removed += 1;
    if ((segments += 1) > MAX_SEGMENTS || removed > MAX_REMOVED_BLOCKS) {
      return MALFORMED;
    }

    if (marker === 0xd9) {
      out.keep(markerAt - 1, markerAt + 1);
      if (markerAt + 1 < input.length) removed += 1; // trailing bytes
      sawEnd = true;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.keep(markerAt - 1, markerAt + 1);
      position = markerAt + 1;
      continue;
    }
    if (marker === 0x00 || marker === 0xd8) return MALFORMED;

    if (markerAt + 3 > input.length) return MALFORMED;
    const length = (input[markerAt + 1]! << 8) | input[markerAt + 2]!;
    const end = markerAt + 1 + length;
    if (length < 2 || end > input.length) return MALFORMED;
    const payload = input.subarray(markerAt + 3, end);

    if (
      marker === 0xe1 &&
      orientation === null &&
      startsWithBytes(payload, EXIF_HEADER)
    ) {
      orientation = readExifOrientation(payload);
    }
    const orientationBlock =
      marker === 0xe1 && !hasOrientationBlock && isOrientationOnlyExif(payload);
    if (orientationBlock) hasOrientationBlock = true;
    const action = orientationBlock ? 'keep' : segmentAction(marker, payload);
    if (action === 'reject') return MALFORMED;
    if (action === 'drop') {
      removed += 1;
    } else {
      if (action === 'keep') out.keep(markerAt - 1, end);
      else {
        out.insert(segment(marker, action));
        removed += 1;
      }
      // EXIF belongs right after the JFIF header when the file starts with one.
      if (keptSegments === 0 && marker === 0xe0) insertAt = out.mark();
      keptSegments += 1;
    }

    position = end;
    if (marker === 0xda) {
      sawScan = true;
      const next = scanEntropyData(input, end);
      out.keep(end, next);
      position = next;
    }
  }

  if (!sawScan || !sawEnd) return MALFORMED;
  if (
    removed > 0 &&
    !hasOrientationBlock &&
    orientation !== null &&
    orientation !== 1
  ) {
    out.insertAt(
      insertAt,
      segment(0xe1, concat([EXIF_HEADER, buildOrientationTiff(orientation)]))
    );
  }
  return done('jpeg', input, () => out.bytes(), removed);
}
