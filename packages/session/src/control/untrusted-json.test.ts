import { describe, expect, it } from 'vitest';
import {
  jsonArray,
  jsonField,
  jsonRecord,
  parseControlJson,
} from './untrusted-json';

describe('parseControlJson', () => {
  it('parses into frozen, prototype-free records', () => {
    const value = parseControlJson('{"items":[{"id":"m1"}],"hasMore":false}');
    const record = jsonRecord(value);
    expect(record).not.toBeNull();
    expect(Object.getPrototypeOf(record)).toBeNull();
    expect(Object.isFrozen(record)).toBe(true);
    const items = jsonArray(jsonField(record ?? {}, 'items'));
    expect(items).toEqual([{ id: 'm1' }]);
    expect(Object.isFrozen(items)).toBe(true);
    expect(Object.isFrozen(items?.[0])).toBe(true);
  });

  it('keeps __proto__ an ordinary own member', () => {
    const record = jsonRecord(parseControlJson('{"__proto__":{"id":"m1"}}'));
    expect(record && jsonField(record, 'id')).toBeUndefined();
    expect(jsonRecord(record && jsonField(record, '__proto__'))).toEqual({
      id: 'm1',
    });
  });

  it.each([
    ['a duplicate member name', '{"id":"a","id":"b"}'],
    ['a nested duplicate', '[{"x":{"k":1,"k":2}}]'],
    ['a fraction', '{"n":1.5}'],
    ['an exponent', '{"n":1e3}'],
    ['an unsafe integer', '{"n":9007199254740993}'],
    ['trailing text', '{} x'],
    ['nesting past the bound', `${'['.repeat(18)}${']'.repeat(18)}`],
  ])('rejects %s', (_, text) => {
    expect(parseControlJson(text)).toBeUndefined();
  });

  it('accepts nesting within the bound', () => {
    expect(
      parseControlJson(`${'['.repeat(17)}${']'.repeat(17)}`)
    ).toBeDefined();
  });

  it('rejects anything but a string', () => {
    for (const value of [{}, [], null, undefined, 1, new String('{}')]) {
      expect(parseControlJson(value)).toBeUndefined();
    }
  });
});

describe('readers', () => {
  it('accept only containers from the parser', () => {
    const parsedArray = parseControlJson('[1]');
    expect(jsonArray(parsedArray)).toEqual([1]);
    expect(jsonArray([1])).toBeNull();
    expect(jsonArray(new Proxy(parsedArray as object, {}))).toBeNull();
    expect(jsonRecord({ id: 'm1' })).toBeNull();
    expect(jsonRecord(Object.create(null))).toBeNull();
    expect(jsonRecord(parsedArray)).toBeNull();
    expect(jsonArray(parseControlJson('{}'))).toBeNull();
  });
});
