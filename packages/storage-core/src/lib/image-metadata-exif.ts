/**
 * Minimal TIFF/EXIF helpers for metadata stripping: read the IFD0
 * Orientation tag and build a replacement block that holds nothing else.
 * Every read is bounds-checked; malformed input yields `null`.
 */

const ORIENTATION_TAG = 0x0112;
const SHORT_TYPE = 3;
const MAX_IFD_ENTRIES = 1024;

export const EXIF_HEADER = Uint8Array.of(0x45, 0x78, 0x69, 0x66, 0, 0);

export function startsWithBytes(
  input: Uint8Array,
  prefix: Uint8Array,
  offset = 0
) {
  if (offset + prefix.length > input.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (input[offset + index] !== prefix[index]) return false;
  }
  return true;
}

/** The IFD0 Orientation (1-8) of a TIFF block, or null when absent or invalid. */
export function readTiffOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  if (view.getUint16(2, little) !== 42) return null;

  const ifd = view.getUint32(4, little);
  if (ifd < 8 || ifd + 2 > tiff.length) return null;
  const count = view.getUint16(ifd, little);
  if (count > MAX_IFD_ENTRIES || ifd + 2 + count * 12 > tiff.length) {
    return null;
  }

  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (view.getUint16(entry, little) !== ORIENTATION_TAG) continue;
    if (view.getUint16(entry + 2, little) !== SHORT_TYPE) return null;
    if (view.getUint32(entry + 4, little) !== 1) return null;
    const value = view.getUint16(entry + 8, little);
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

/** EXIF payloads may carry the `Exif\0\0` header before the TIFF block. */
export function readExifOrientation(payload: Uint8Array): number | null {
  return readTiffOrientation(
    startsWithBytes(payload, EXIF_HEADER)
      ? payload.subarray(EXIF_HEADER.length)
      : payload
  );
}

/** A big-endian TIFF block whose only IFD0 entry is Orientation. */
export function buildOrientationTiff(orientation: number): Uint8Array {
  const tiff = new Uint8Array(26);
  const view = new DataView(tiff.buffer);
  view.setUint16(0, 0x4d4d);
  view.setUint16(2, 42);
  view.setUint32(4, 8);
  view.setUint16(8, 1);
  view.setUint16(10, ORIENTATION_TAG);
  view.setUint16(12, SHORT_TYPE);
  view.setUint32(14, 1);
  view.setUint16(18, orientation);
  // Bytes 20-21 pad the value; bytes 22-25 end the IFD chain.
  return tiff;
}

/** True for exactly the block `buildOrientationTiff` writes, so it survives re-stripping. */
export function isOrientationOnlyTiff(tiff: Uint8Array) {
  const orientation = readTiffOrientation(tiff);
  if (orientation === null) return false;
  const expected = buildOrientationTiff(orientation);
  return tiff.length === expected.length && startsWithBytes(tiff, expected);
}

export function isOrientationOnlyExif(payload: Uint8Array) {
  return isOrientationOnlyTiff(
    startsWithBytes(payload, EXIF_HEADER)
      ? payload.subarray(EXIF_HEADER.length)
      : payload
  );
}
