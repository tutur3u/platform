import { describe, expect, it } from 'vitest';
import { canonicalJson } from './encoding';

const nullRecord = (entries: Record<string, unknown>) =>
  Object.assign(Object.create(null) as Record<string, unknown>, entries);

describe('canonicalJson golden vectors', () => {
  it.each<[string, unknown, string]>([
    ['null', null, 'null'],
    ['true', true, 'true'],
    ['false', false, 'false'],
    ['zero', 0, '0'],
    ['a negative integer', -7, '-7'],
    ['the largest safe integer', Number.MAX_SAFE_INTEGER, '9007199254740991'],
    ['the smallest safe integer', Number.MIN_SAFE_INTEGER, '-9007199254740991'],
    ['an empty string', '', '""'],
    ['an empty array', [], '[]'],
    ['an empty object', {}, '{}'],
    ['a quote and a backslash', 'a"b\\c', '"a\\"b\\\\c"'],
    [
      'control characters as lowercase \\u00xx',
      '\n\t\r\b\f\u0000\u001f\u001b',
      '"\\u000a\\u0009\\u000d\\u0008\\u000c\\u0000\\u001f\\u001b"',
    ],
    ['DEL, slash, U+2028 and non-ASCII unescaped', '\u007f/ é', '"\u007f/ é"'],
    ['a surrogate pair kept raw', '😀', '"😀"'],
    // A decomposed é stays decomposed: no Unicode normalization.
    ['no normalization', 'é', '"é"'],
    [
      'members sorted by UTF-16 code unit',
      { b: 1, a: 2, A: 3, '': 0, aa: 4 },
      '{"":0,"A":3,"a":2,"aa":4,"b":1}',
    ],
    // U+1F600 sorts before U+FF61 by code unit (0xD83D < 0xFF61), not by code point.
    [
      'code unit order, not code point order',
      { '｡': 1, '😀': 2 },
      '{"😀":2,"｡":1}',
    ],
    ['escaped member names', { 'a\n': 1, '"': 2 }, '{"\\"":2,"a\\u000a":1}'],
    [
      'recursive nesting',
      { z: [1, { y: null, x: [true, false] }], a: { c: 'd', b: [] } },
      '{"a":{"b":[],"c":"d"},"z":[1,{"x":[true,false],"y":null}]}',
    ],
    ['arrays keep their order', [3, 1, 2, 'b', 'a'], '[3,1,2,"b","a"]'],
    [
      'a null-prototype object',
      nullRecord({ b: 1, a: 'x' }),
      '{"a":"x","b":1}',
    ],
    [
      'an own __proto__ member of a null-prototype object',
      nullRecord({ ['__proto__']: 1 }),
      '{"__proto__":1}',
    ],
    ['a base64url binary value', { key: 'AQIDBA' }, '{"key":"AQIDBA"}'],
  ])('encodes %s', (_name, value, expected) => {
    expect(canonicalJson(value)).toBe(expected);
  });

  it('round-trips through JSON.parse', () => {
    const value = { b: ['\u0001"\\', null], a: { d: false, c: -1 } };
    const text = canonicalJson(value) as string;
    expect(canonicalJson(JSON.parse(text))).toBe(text);
  });

  it('accepts a value shared by two members that is not a cycle', () => {
    const shared = { a: 1 };
    expect(canonicalJson({ p: shared, q: [shared] })).toBe(
      '{"p":{"a":1},"q":[{"a":1}]}'
    );
  });
});

class Plain {
  a = 1;
}

function rejected(): Array<[string, unknown]> {
  const cyclicObject: Record<string, unknown> = {};
  cyclicObject.self = cyclicObject;
  const cyclicArray: unknown[] = [];
  cyclicArray.push(cyclicArray);
  const extraMember = Object.assign([1, 2], { extra: 3 });
  const symbolArray = Object.assign([1], { [Symbol('s')]: 1 });
  const hidden = Object.defineProperty({}, 'a', {
    value: 1,
    enumerable: false,
  });
  const getter = Object.defineProperty({}, 'a', {
    get: () => 1,
    enumerable: true,
  });
  const getterIndex = Object.defineProperty([0], '0', {
    get: () => 1,
    enumerable: true,
  });
  const sparse: unknown[] = [];
  sparse[1] = 1;
  const throwing = new Proxy(
    {},
    {
      ownKeys: () => {
        throw new Error('trap');
      },
    }
  );
  return [
    ['undefined', undefined],
    ['a nested undefined member', { a: undefined }],
    ['an undefined array element', [undefined]],
    ['a function', () => 1],
    ['a nested function', { a: () => 1 }],
    ['a symbol', Symbol('s')],
    ['a bigint', 1n],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['-0', -0],
    ['a nested -0', [-0]],
    ['an unsafe integer', Number.MAX_SAFE_INTEGER + 1],
    ['an exponent-sized number', 1e21],
    ['a lone high surrogate', '\ud800'],
    ['a lone low surrogate', '\udc00'],
    ['a trailing high surrogate', 'a\ud83d'],
    ['a high surrogate before a non-surrogate', '\ud83da'],
    ['reversed surrogates', '\ude00\ud83d'],
    ['a lone surrogate member name', { '\ud800': 1 }],
    ['a sparse array', sparse],
    ['a hole-only array', new Array(2)],
    ['an array with an extra member', extraMember],
    ['an array with a symbol member', symbolArray],
    ['an array subclass', new (class extends Array {})()],
    ['an object with a symbol key', { [Symbol('s')]: 1 }],
    ['a non-enumerable member', hidden],
    ['an accessor member', getter],
    ['an accessor element', getterIndex],
    ['a class instance', new Plain()],
    ['an object with an inherited prototype', Object.create({ a: 1 })],
    ['a Date', new Date(0)],
    ['a Map', new Map()],
    ['a Set', new Set()],
    ['a RegExp', /a/],
    ['a Uint8Array', new Uint8Array([1])],
    ['an ArrayBuffer', new ArrayBuffer(1)],
    ['a boxed string', Object('x')],
    ['a boxed number', Object(1)],
    ['a boxed boolean', Object(true)],
    ['an Error', new Error('x')],
    ['a cyclic object', cyclicObject],
    ['a cyclic array', cyclicArray],
    ['a proxy whose trap throws', throwing],
  ];
}

describe('canonicalJson rejected inputs', () => {
  it.each(rejected())('rejects %s without throwing', (_name, value) => {
    expect(canonicalJson(value)).toBeUndefined();
  });
});
