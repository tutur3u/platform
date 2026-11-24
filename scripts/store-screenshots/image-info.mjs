// Reads format, pixel size and channel layout from PNG, JPEG, WebP and AVIF headers, so
// store assets can be checked without an image library.

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// Start-of-frame markers that carry dimensions (excludes DHT, JPG and DAC).
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

// PNG colour types that carry an alpha channel.
const PNG_ALPHA_TYPES = new Set([4, 6]);

/**
 * @returns {{ format: 'png' | 'jpeg' | 'webp', width: number, height: number,
 *   channels: number, alpha: boolean } | null}
 */
export function readImageInfo(buffer) {
  if (buffer.length >= 33 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    const colorType = buffer[25];
    // A tRNS chunk adds transparency to colour types without an alpha channel.
    const alpha = PNG_ALPHA_TYPES.has(colorType) || hasPngChunk(buffer, 'tRNS');
    return {
      format: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      channels: { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType] ?? 0,
      alpha,
    };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return readJpegInfo(buffer);
  }
  if (
    buffer.length >= 30 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return readWebpInfo(buffer);
  }
  if (buffer.length >= 32 && buffer.toString('latin1', 4, 12) === 'ftypavif') {
    return readAvifInfo(buffer);
  }
  return null;
}

// AVIF is an ISO base media file. The image size is the `ispe` box and an alpha
// auxiliary image is declared with the `auxiliary:alpha` URN in an `auxC` box;
// both live in meta > iprp > ipco, so a stray byte match elsewhere (in the
// image data, for one) is never read as a header.
const AVIF_PROPERTY_PATH = [
  { type: 'meta', skip: 4 },
  { type: 'iprp', skip: 0 },
  { type: 'ipco', skip: 0 },
];

function* isoBoxes(buffer, start, end) {
  let at = start;
  while (at + 8 <= end) {
    let size = buffer.readUInt32BE(at);
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) return;
      size = Number(buffer.readBigUInt64BE(at + 8));
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) return;
    yield {
      type: buffer.toString('latin1', at + 4, at + 8),
      body: at + header,
      end: at + size,
    };
    at += size;
  }
}

function findAvifProperties(buffer) {
  let range = { body: 0, end: buffer.length };
  for (const { type, skip } of AVIF_PROPERTY_PATH) {
    let next = null;
    for (const box of isoBoxes(buffer, range.body, range.end)) {
      if (box.type === type) {
        next = { body: box.body + skip, end: box.end };
        break;
      }
    }
    if (!next) return null;
    range = next;
  }
  return isoBoxes(buffer, range.body, range.end);
}

function readAvifInfo(buffer) {
  const properties = findAvifProperties(buffer);
  if (!properties) return null;
  let size = null;
  let alpha = false;
  for (const box of properties) {
    // `ispe` is a full box: 4 bytes of version and flags, then width and height.
    if (box.type === 'ispe' && !size && box.end - box.body >= 12) {
      size = {
        width: buffer.readUInt32BE(box.body + 4),
        height: buffer.readUInt32BE(box.body + 8),
      };
    } else if (
      box.type === 'auxC' &&
      buffer
        .subarray(box.body, box.end)
        .includes('auxiliary:alpha', 0, 'latin1')
    ) {
      alpha = true;
    }
  }
  if (!size) return null;
  return {
    format: 'avif',
    ...size,
    channels: alpha ? 4 : 3,
    alpha,
  };
}

function readWebpInfo(buffer) {
  const chunk = buffer.toString('latin1', 12, 16);
  if (chunk === 'VP8 ') {
    // Lossy: a 3-byte frame tag, the 9d 01 2a start code, then 14-bit sizes.
    return {
      format: 'webp',
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
      channels: 3,
      alpha: false,
    };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      format: 'webp',
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
      channels: 4,
      alpha: Boolean((bits >> 28) & 1),
    };
  }
  if (chunk === 'VP8X') {
    return {
      format: 'webp',
      width: buffer.readUIntLE(24, 3) + 1,
      height: buffer.readUIntLE(27, 3) + 1,
      channels: buffer[20] & 0x10 ? 4 : 3,
      alpha: Boolean(buffer[20] & 0x10),
    };
  }
  return null;
}

function hasPngChunk(buffer, type) {
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const name = buffer.toString('latin1', offset + 4, offset + 8);
    if (name === type) return true;
    if (name === 'IDAT' || name === 'IEND') return false;
    offset += 12 + length;
  }
  return false;
}

function readJpegInfo(buffer) {
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0x01
    ) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (SOF_MARKERS.has(marker)) {
      if (offset + 10 > buffer.length) return null;
      const channels = buffer[offset + 9];
      return {
        format: 'jpeg',
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
        channels,
        // JPEG has no alpha; four components mean CMYK, which stores reject.
        alpha: false,
      };
    }
    offset += 2 + length;
  }
  return null;
}
