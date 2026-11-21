import { encode } from 'cborg';
import { describe, expect, it } from 'vitest';
import { decodeBase32, encodeBase32 } from './base32';
import { fromHex, randomBytes } from './bytes';
import { decodeCanonical, encodeCanonical } from './canonical';
import { contextBytes, domainLabel } from './context';

describe('canonical CBOR', () => {
  it('sorts keys and is stable', () => {
    const a = encodeCanonical({
      b: 1,
      a: [true, null, 'x'],
      c: new Uint8Array([1]),
    });
    const b = encodeCanonical({
      c: new Uint8Array([1]),
      a: [true, null, 'x'],
      b: 1,
    });
    expect(a).toEqual(b);
    expect(decodeCanonical(a)).toEqual({
      a: [true, null, 'x'],
      b: 1,
      c: new Uint8Array([1]),
    });
  });

  it('refuses floats, undefined, bigints and class instances', () => {
    expect(() => encodeCanonical({ x: 1.5 })).toThrow();
    expect(() => encodeCanonical({ x: undefined as never })).toThrow();
    expect(() => encodeCanonical({ x: 1n as never })).toThrow();
    expect(() => encodeCanonical({ x: new Date() as never })).toThrow();
  });

  it('rejects non-canonical encodings', () => {
    // {"b":1,"a":2} with unsorted keys
    expect(() => decodeCanonical(fromHex('a2616201616102'))).toThrow();
    // integer 1 encoded in two bytes
    expect(() => decodeCanonical(fromHex('1801'))).toThrow();
    // duplicate key
    expect(() => decodeCanonical(fromHex('a2616101616102'))).toThrow();
    // indefinite-length array
    expect(() => decodeCanonical(fromHex('9f01ff'))).toThrow();
    // float
    expect(() => decodeCanonical(encode(1.5))).toThrow();
    // trailing byte
    expect(() => decodeCanonical(fromHex('0100'))).toThrow();
  });
});

describe('context binding', () => {
  it('separates purposes and contexts', () => {
    expect(domainLabel('value')).toBe('tuturuuu/vault/value/v1');
    expect(contextBytes('value', { a: 1 })).not.toEqual(
      contextBytes('wrap', { a: 1 })
    );
    expect(contextBytes('value', { a: 1 })).not.toEqual(
      contextBytes('value', { a: 2 })
    );
  });

  it('rejects unknown purposes', () => {
    expect(() => domainLabel('nope' as never)).toThrow();
  });
});

describe('Crockford base32', () => {
  it('round-trips and reads look-alike letters', () => {
    const bytes = randomBytes(32);
    const code = encodeBase32(bytes);
    expect(decodeBase32(code, 32)).toEqual(bytes);
    expect(decodeBase32(code.toLowerCase(), 32)).toEqual(bytes);
    expect(decodeBase32('0O1L0', 3)).toEqual(decodeBase32('00110', 3));
  });

  it('rejects wrong length, invalid characters and non-zero padding', () => {
    expect(() => decodeBase32('ABC', 32)).toThrow();
    expect(() => decodeBase32('U'.repeat(52), 32)).toThrow();
    const code = encodeBase32(new Uint8Array(32));
    expect(() => decodeBase32(`${code.slice(0, -1)}1`, 32)).toThrow();
  });
});
