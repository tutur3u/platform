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
 * How `parseStrictJson` reads numbers.
 *
 * - `safeInteger`: canonical safe integers only: no fraction, exponent or
 *   `-0`, so a claim can never round into an accepted value.
 * - `finiteDecimal`: canonical decimal notation, for API fields such as a
 *   traffic percentage that may be fractional. No exponent, NaN or Infinity;
 *   no leading zero except `0.x`; no trailing dot. The literal must be the
 *   shortest round-trip spelling of the number it parses to, so `12.50`,
 *   `1.0`, `-0`, digits past double precision and magnitudes that JavaScript
 *   spells with an exponent (below 1e-6 or from 1e21) fail.
 */
export type StrictJsonNumbers = 'safeInteger' | 'finiteDecimal';

const SAFE_INTEGER_LITERAL = /^(?:true|false|null|-?(?:0|[1-9]\d{0,15}))/;
const DECIMAL_LITERAL = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?)/;

/**
 * Parses the JSON subset used by session tokens. It rejects duplicate member
 * names at any depth (`JSON.parse` keeps the last one, which would let a token
 * carry two values for one claim), returns objects without a prototype, and
 * reads numbers by `numbers`, which defaults to canonical safe integers.
 * Values nest at most `maxDepth` containers below the root; tokens keep the
 * default of 8, and API bodies read by the control modules pass a deeper
 * bound.
 */
export function parseStrictJson(
  text: string,
  maxDepth = 8,
  numbers: StrictJsonNumbers = 'safeInteger'
): JsonValue | undefined {
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
    if (depth > maxDepth) fail();
    skipWhitespace();
    const char = text[position];
    if (char === '{') {
      position += 1;
      // A null-prototype record keeps `__proto__` an ordinary own member.
      const result = Object.create(null) as { [key: string]: JsonValue };
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
    const literal = (
      numbers === 'finiteDecimal' ? DECIMAL_LITERAL : SAFE_INTEGER_LITERAL
    ).exec(text.slice(position));
    if (!literal) return fail();
    const token = literal[0];
    position += token.length;
    const next = text[position];
    if (next !== undefined && /[0-9.eE+-]/.test(next)) fail();
    if (token === '-0') fail();
    const parsed = JSON.parse(token) as JsonValue;
    if (typeof parsed === 'number') {
      const canonical =
        numbers === 'finiteDecimal'
          ? Number.isFinite(parsed) && String(parsed) === token
          : Number.isSafeInteger(parsed);
      if (!canonical) fail();
    }
    return parsed;
  };

  try {
    const value = readValue(0);
    skipWhitespace();
    return position === text.length ? value : undefined;
  } catch {
    return undefined;
  }
}

export function hasOwn(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function isJsonObject(
  value: JsonValue | undefined
): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The canonical JSON serializer of step-up parameters. Both the minting and
 * the verifying side hash its output, so it accepts only values with exactly
 * one encoding: `null`, booleans, safe integers other than `-0`, strings
 * without lone surrogates, dense arrays and plain objects (prototype
 * `Object.prototype` or `null`, only own enumerable string-keyed data
 * properties). Object members are sorted by UTF-16 code unit, nothing is
 * indented, and strings escape only `"`, `\` and U+0000 to U+001F, the
 * control characters as lowercase `\u00xx`. Binary values are passed as
 * canonical base64url strings. Anything else, including cycles, returns
 * `undefined` rather than being dropped or coerced; it never throws.
 */
export function canonicalJson(value: unknown): string | undefined {
  const ancestors = new Set<object>();
  const parts: string[] = [];

  const fail = (): never => {
    throw new StrictJsonError();
  };
  const writeString = (text: string) => {
    let out = '"';
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(index + 1);
        // NaN past the end fails both comparisons.
        if (!(next >= 0xdc00 && next <= 0xdfff)) fail();
        out += text[index] + (text[index + 1] as string);
        index += 1;
        continue;
      }
      if (code >= 0xdc00 && code <= 0xdfff) fail();
      if (code === 0x22) out += '\\"';
      else if (code === 0x5c) out += '\\\\';
      else if (code < 0x20) out += `\\u00${code.toString(16).padStart(2, '0')}`;
      else out += text[index];
    }
    parts.push(`${out}"`);
  };
  /** Reads an own data property without running a getter. */
  const dataValue = (record: object, key: string): unknown => {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      fail();
    }
    return (descriptor as PropertyDescriptor).value;
  };
  const write = (current: unknown) => {
    if (current === null) return void parts.push('null');
    if (current === true || current === false) {
      return void parts.push(current ? 'true' : 'false');
    }
    if (typeof current === 'number') {
      if (!Number.isSafeInteger(current) || Object.is(current, -0)) fail();
      return void parts.push(String(current));
    }
    if (typeof current === 'string') return writeString(current);
    if (typeof current !== 'object') return fail();
    if (ancestors.has(current)) fail();
    ancestors.add(current);
    const keys = Reflect.ownKeys(current);
    if (Array.isArray(current)) {
      if (Object.getPrototypeOf(current) !== Array.prototype) fail();
      // Exactly the indices and `length`: no holes, no extra members.
      if (keys.length !== current.length + 1) fail();
      parts.push('[');
      for (let index = 0; index < current.length; index += 1) {
        if (index > 0) parts.push(',');
        write(dataValue(current, String(index)));
      }
      parts.push(']');
    } else {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) fail();
      if (keys.some((key) => typeof key !== 'string')) fail();
      // The default sort compares UTF-16 code units.
      const names = (keys as string[]).sort();
      parts.push('{');
      names.forEach((name, index) => {
        if (index > 0) parts.push(',');
        writeString(name);
        parts.push(':');
        write(dataValue(current, name));
      });
      parts.push('}');
    }
    ancestors.delete(current);
  };

  try {
    write(value);
    return parts.join('');
  } catch {
    return undefined;
  }
}
