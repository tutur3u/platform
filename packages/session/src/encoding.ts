/**
 * Strict encoders shared by the cookie codec and the assertion verifier.
 * Every decoder rejects non-canonical input so that two different strings can
 * never stand for the same bytes or the same JSON value.
 */

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Decodes canonical, unpadded base64url. Returns null for anything else. */
export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) return null;
  const padded =
    value.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (value.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  // Re-encoding rejects non-zero trailing bits, which decode to the same bytes.
  return encodeBase64Url(bytes) === value ? bytes : null;
}

export function utf8(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(value));
}

export function constantTimeEqual(
  left: Uint8Array,
  right: Uint8Array
): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

class StrictJsonError extends Error {}

/**
 * Parses JSON like `JSON.parse`, but rejects duplicate member names at any
 * depth. `JSON.parse` keeps the last duplicate, which would let a token carry
 * two values for one claim.
 */
export function parseStrictJson(text: string): JsonValue | undefined {
  let position = 0;

  const fail = (): never => {
    throw new StrictJsonError();
  };
  const skipWhitespace = () => {
    while (position < text.length && ' \t\n\r'.includes(text[position] ?? '')) {
      position += 1;
    }
  };
  const readString = (): string => {
    const start = position;
    if (text[position] !== '"') fail();
    position += 1;
    while (position < text.length) {
      const char = text[position];
      if (char === '\\') {
        position += 2;
        continue;
      }
      if (char === '"') {
        position += 1;
        return JSON.parse(text.slice(start, position)) as string;
      }
      if (char !== undefined && char < ' ') fail();
      position += 1;
    }
    return fail();
  };
  const readValue = (depth: number): JsonValue => {
    if (depth > 8) fail();
    skipWhitespace();
    const char = text[position];
    if (char === '{') {
      position += 1;
      const result: { [key: string]: JsonValue } = {};
      const seen = new Set<string>();
      skipWhitespace();
      if (text[position] === '}') {
        position += 1;
        return result;
      }
      for (;;) {
        skipWhitespace();
        const key = readString();
        if (seen.has(key)) fail();
        seen.add(key);
        skipWhitespace();
        if (text[position] !== ':') fail();
        position += 1;
        result[key] = readValue(depth + 1);
        skipWhitespace();
        if (text[position] === ',') {
          position += 1;
          continue;
        }
        if (text[position] === '}') {
          position += 1;
          return result;
        }
        fail();
      }
    }
    if (char === '[') {
      position += 1;
      const result: JsonValue[] = [];
      skipWhitespace();
      if (text[position] === ']') {
        position += 1;
        return result;
      }
      for (;;) {
        result.push(readValue(depth + 1));
        skipWhitespace();
        if (text[position] === ',') {
          position += 1;
          continue;
        }
        if (text[position] === ']') {
          position += 1;
          return result;
        }
        fail();
      }
    }
    if (char === '"') return readString();
    const literal =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        text.slice(position)
      );
    if (!literal) return fail();
    position += literal[0].length;
    return JSON.parse(literal[0]) as JsonValue;
  };

  try {
    const value = readValue(0);
    skipWhitespace();
    return position === text.length ? value : undefined;
  } catch {
    return undefined;
  }
}

export function isJsonObject(
  value: JsonValue | undefined
): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
