/**
 * Shareable meeting codes.
 *
 * The code is a reversible Crockford base32 encoding of the meeting UUID rather
 * than a stored random string. That means no schema change, no collisions and
 * no lookup table — decoding a code yields the meeting id directly, and an
 * invalid code is rejected without touching the database.
 *
 * Crockford's alphabet omits I, L, O and U, so the visually ambiguous
 * characters cannot appear; decoding still accepts them and folds them onto the
 * digits people meant.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUP_SIZES = [9, 9, 8] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function uuidToBytes(uuid: string) {
  const hex = uuid.replace(/-/gu, '');
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function bytesToUuid(bytes: Uint8Array) {
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** `5e5217de-…` → `bwkhfrfc0-hf9ttx0m8-h9x8kmr8` */
export function encodeRoomCode(meetingId: string): string {
  if (!UUID_PATTERN.test(meetingId)) {
    throw new Error('encodeRoomCode expects a meeting UUID');
  }

  const bytes = uuidToBytes(meetingId);
  let bits = 0;
  let value = 0;
  let encoded = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) {
    encoded += ALPHABET[(value << (5 - bits)) & 31];
  }

  let offset = 0;
  return GROUP_SIZES.map((size) => {
    const group = encoded.slice(offset, offset + size);
    offset += size;
    return group;
  })
    .join('-')
    .toLowerCase();
}

function normalizeCode(code: string) {
  return (
    code
      .trim()
      .toUpperCase()
      .replace(/[\s-]/gu, '')
      // Crockford: fold the characters the alphabet deliberately omits.
      .replace(/[IL]/gu, '1')
      .replace(/O/gu, '0')
      .replace(/U/gu, 'V')
  );
}

/** Returns the meeting id, or null when the code is not a valid one. */
export function decodeRoomCode(code: string): string | null {
  const normalized = normalizeCode(code);
  if (normalized.length !== 26) return null;

  const bytes = new Uint8Array(16);
  let bits = 0;
  let value = 0;
  let index = 0;

  for (const char of normalized) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return null;

    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (index >= 16) return null;
      bytes[index] = (value >>> bits) & 255;
      index += 1;
    }
  }

  if (index !== 16) return null;
  const uuid = bytesToUuid(bytes);
  return UUID_PATTERN.test(uuid) ? uuid : null;
}

export function buildJoinUrl(origin: string, meetingId: string) {
  return `${origin.replace(/\/+$/u, '')}/r/${encodeRoomCode(meetingId)}`;
}
