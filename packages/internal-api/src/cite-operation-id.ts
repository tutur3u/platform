/** RFC 9562 UUIDv7: timestamp48, random74, with the version and variant bits. */
export function createCitationOperationId(
  options: {
    now?: () => number;
    random?: (bytes: Uint8Array) => Uint8Array;
  } = {}
) {
  const now = (options.now ?? Date.now)();
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffffffff) {
    throw new RangeError('Invalid citation operation time');
  }
  const bytes = (options.random ?? ((value) => crypto.getRandomValues(value)))(
    new Uint8Array(16)
  );
  if (bytes.length !== 16)
    throw new RangeError('Invalid citation operation randomness');
  let timestamp = now;
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, '0')
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
