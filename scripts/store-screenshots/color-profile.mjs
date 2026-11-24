// Reads the colour profile an image declares, so store images can be limited
// to sRGB or untagged RGB. Display P3, Adobe RGB and other profiles shift
// colours on devices that render the listing as sRGB.
import zlib from 'node:zlib';

const PNG_SIGNATURE_LENGTH = 8;

/**
 * @typedef {{ kind: 'untagged' | 'srgb' | 'other', name: string | null }} ColorProfile
 */

/** Description text of an ICC profile (`desc` tag), or null when unreadable. */
export function iccDescription(profile) {
  if (profile.length < 132) return null;
  const count = profile.readUInt32BE(128);
  for (let i = 0; i < count; i += 1) {
    const entry = 132 + i * 12;
    if (entry + 12 > profile.length) return null;
    if (profile.toString('latin1', entry, entry + 4) !== 'desc') continue;
    const offset = profile.readUInt32BE(entry + 4);
    const size = profile.readUInt32BE(entry + 8);
    if (offset + size > profile.length || size < 12) return null;
    const type = profile.toString('latin1', offset, offset + 4);
    if (type === 'desc') {
      // ICC v2: a length-prefixed ASCII string.
      const length = profile.readUInt32BE(offset + 8);
      return profile
        .toString('latin1', offset + 12, offset + 12 + length)
        .replace(/\0+$/u, '');
    }
    if (type === 'mluc' && size >= 28) {
      // ICC v4: UTF-16BE records; the first one names the profile.
      const length = profile.readUInt32BE(offset + 20);
      const start = offset + profile.readUInt32BE(offset + 24);
      return Buffer.from(profile.subarray(start, start + length))
        .swap16()
        .toString('utf16le');
    }
    return null;
  }
  return null;
}

/** Classifies an ICC profile: only RGB profiles named sRGB are accepted. */
export function classifyIcc(profile) {
  const name = iccDescription(profile);
  const space = profile.length >= 20 ? profile.toString('latin1', 16, 20) : '';
  if (space === 'RGB ' && name && /srgb/iu.test(name))
    return { kind: 'srgb', name };
  return { kind: 'other', name: name ?? (space.trim() || null) };
}

function pngProfile(buffer) {
  let offset = PNG_SIGNATURE_LENGTH;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'sRGB') return { kind: 'srgb', name: 'sRGB' };
    if (type === 'iCCP') {
      const nul = data.indexOf(0);
      try {
        // Name, NUL, compression method, then the zlib-compressed profile.
        return classifyIcc(zlib.inflateSync(data.subarray(nul + 2)));
      } catch {
        return { kind: 'other', name: 'unreadable ICC profile' };
      }
    }
    if (type === 'IDAT' || type === 'IEND') break;
    offset += 12 + length;
  }
  return { kind: 'untagged', name: null };
}

function jpegProfile(buffer) {
  const chunks = [];
  let offset = 2;
  while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (
      marker === 0xe2 &&
      buffer.toString('latin1', offset + 4, offset + 15) === 'ICC_PROFILE'
    ) {
      // APP2 chunks: "ICC_PROFILE\0", sequence number, chunk count, data.
      chunks.push([
        buffer[offset + 16],
        buffer.subarray(offset + 18, offset + 2 + length),
      ]);
    }
    offset += 2 + length;
  }
  if (chunks.length === 0) return { kind: 'untagged', name: null };
  chunks.sort((a, b) => a[0] - b[0]);
  return classifyIcc(Buffer.concat(chunks.map(([, data]) => data)));
}

/**
 * The colour profile declared by a PNG or JPEG, or null for other formats.
 * @returns {ColorProfile | null}
 */
export function readColorProfile(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50)
    return pngProfile(buffer);
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8)
    return jpegProfile(buffer);
  return null;
}

/** Problems when [buffer] declares a profile other than sRGB. */
export function checkColorProfile(label, buffer) {
  const profile = readColorProfile(buffer);
  if (!profile || profile.kind !== 'other') return [];
  return [
    `${label}: colour profile "${profile.name ?? 'unknown'}" is not sRGB; export sRGB or untagged`,
  ];
}
