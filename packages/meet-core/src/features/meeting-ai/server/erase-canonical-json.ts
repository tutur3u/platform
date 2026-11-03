/**
 * Canonical erase JSON uses safe integers, ordered arrays and JSON scalar encoding.
 * Object keys sort by UTF-16 code units; other-language verifiers must match.
 */
export function canonicalEraseJson(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(current: unknown): string {
    if (current === null) return 'null';
    if (typeof current === 'string' || typeof current === 'boolean')
      return JSON.stringify(current);
    if (
      typeof current === 'number' &&
      Number.isSafeInteger(current) &&
      !Object.is(current, -0)
    )
      return JSON.stringify(current);
    if (typeof current !== 'object' || ancestors.has(current))
      throw new Error('MEET_ERASE_INVALID_JSON');
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        return `[${Array.from(current, encode).join(',')}]`;
      }
      if (
        Object.getPrototypeOf(current) !== Object.prototype &&
        Object.getPrototypeOf(current) !== null
      ) {
        throw new Error('MEET_ERASE_INVALID_JSON');
      }
      return `{${Object.keys(current)
        .sort()
        .map((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(current, key);
          if (!descriptor || !('value' in descriptor))
            throw new Error('MEET_ERASE_INVALID_JSON');
          return `${JSON.stringify(key)}:${encode(descriptor.value)}`;
        })
        .join(',')}}`;
    } finally {
      ancestors.delete(current);
    }
  }
  return encode(value);
}
