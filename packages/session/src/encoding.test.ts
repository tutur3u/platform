import { describe, expect, it } from 'vitest';
import {
  constantTimeEqual,
  decodeBase64Url,
  encodeBase64Url,
  parseStrictJson,
} from './encoding';

describe('canonical base64url', () => {
  it('round-trips bytes without padding', () => {
    const bytes = new Uint8Array([0, 1, 254, 255, 128]);
    const encoded = encodeBase64Url(bytes);
    expect(encoded).not.toMatch(/[=+/]/);
    expect(decodeBase64Url(encoded)).toEqual(bytes);
  });

  it.each(['AB', 'AAB', 'AA==', 'A', 'a+b/', 'ab c'])(
    'rejects non-canonical %j',
    (value) => {
      expect(decodeBase64Url(value)).toBeNull();
    }
  );
});

describe('strict JSON', () => {
  it('parses ordinary JSON', () => {
    expect(parseStrictJson('{"a":[1,"x",true,null,{"b":-2500}]}')).toEqual({
      a: [1, 'x', true, null, { b: -2500 }],
    });
  });

  it.each([
    '{"a":1,"a":2}',
    '{"a":{"b":1,"b":1}}',
    '{"a":1}x',
    '{"a":01}',
    '{"a":"\u0001"}',
    '{"a":"\\x"}',
    "{'a':1}",
    '{"a":1,}',
    '[[[[[[[[[[1]]]]]]]]]]',
  ])('rejects %j', (text) => {
    expect(parseStrictJson(text)).toBeUndefined();
  });
});

describe('strict JSON number policies', () => {
  const decimal = (text: string) => parseStrictJson(text, 8, 'finiteDecimal');

  it.each(['12.5', '1.5', '0.25', '-3.75'])(
    'keeps safe integers by default and rejects %s',
    (text) => {
      expect(parseStrictJson(text)).toBeUndefined();
      expect(parseStrictJson(`{"exp":${text}}`)).toBeUndefined();
    }
  );

  it.each([
    ['12.5', 12.5],
    ['0.01', 0.01],
    ['0.5', 0.5],
    ['100', 100],
    ['0', 0],
    ['-2.25', -2.25],
    ['9007199254740993.5', undefined],
  ])('reads canonical decimal %s', (text, value) => {
    expect(decimal(text)).toBe(value);
  });

  it.each([
    '12.50',
    '1.0',
    '1.',
    '.5',
    '01.5',
    '00',
    '-0',
    '-0.0',
    '1e2',
    '1E2',
    '1.5e1',
    '+1',
    'NaN',
    'Infinity',
    '-Infinity',
    '0.1000000000000000000001',
    '0.0000001',
    '1000000000000000000000',
  ])('rejects non-canonical decimal %j', (text) => {
    expect(decimal(text)).toBeUndefined();
  });

  it('applies the policy at every depth', () => {
    expect(decimal('{"v":[{"percentage":12.5}]}')).toEqual({
      v: [{ percentage: 12.5 }],
    });
    expect(decimal('{"v":[{"percentage":12.50}]}')).toBeUndefined();
  });
});

it('compares bytes in constant time and by length', () => {
  expect(
    constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))
  ).toBe(true);
  expect(
    constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))
  ).toBe(false);
  expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(
    false
  );
});

it('keeps __proto__ as an own member on a prototype-free object', () => {
  const parsed = parseStrictJson('{"__proto__":{"polluted":true}}') as Record<
    string,
    unknown
  >;
  expect(Object.getPrototypeOf(parsed)).toBeNull();
  expect(Object.keys(parsed)).toEqual(['__proto__']);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});
