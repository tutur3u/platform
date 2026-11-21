import { describe, expect, it } from 'vitest';
import { ownElements, ownStrings, ownValue } from './own-data';

describe('ownElements', () => {
  it('copies own data elements by index', () => {
    expect(ownElements([1, 'a', null])).toEqual([1, 'a', null]);
  });

  it('ignores an overridden slice, iterator and map', () => {
    const items = ['admin'];
    Object.setPrototypeOf(
      items,
      Object.assign(Object.create(Array.prototype), {
        slice: () => [],
        map: () => [],
        [Symbol.iterator]: function* () {},
      })
    );
    expect(ownElements(items)).toEqual(['admin']);
  });

  it('fails on a hole, an accessor element or a non-array', () => {
    const holed: unknown[] = [];
    holed.length = 1;
    const accessor: unknown[] = [];
    Object.defineProperty(accessor, '0', { get: () => 'x', enumerable: true });
    for (const value of [holed, accessor, { length: 0 }, null, 'x']) {
      expect(ownElements(value)).toBeNull();
    }
  });
});

describe('ownElements length', () => {
  const reporting = (length: number) =>
    new Proxy(['admin'], {
      getOwnPropertyDescriptor(target, key) {
        return key === 'length'
          ? {
              value: length,
              writable: true,
              enumerable: false,
              configurable: false,
            }
          : Reflect.getOwnPropertyDescriptor(target, key);
      },
    });

  it.each([-1, 0.5, 1.5, Number.NaN, 2 ** 32])(
    'fails on a reported length of %s',
    (length) => {
      expect(ownElements(reporting(length))).toBeNull();
    }
  );

  it('copies a reported in-range length', () => {
    expect(ownElements(reporting(1))).toEqual(['admin']);
  });
});

describe('ownValue', () => {
  it('reads own data only', () => {
    const inherited = Object.create({ name: 'x' });
    const getter = Object.defineProperty({}, 'name', { get: () => 'x' });
    expect(ownValue({ name: 'x' }, 'name')).toBe('x');
    expect(ownValue(inherited, 'name')).toBeUndefined();
    expect(ownValue(getter, 'name')).toBeUndefined();
  });
});

describe('descriptor reads', () => {
  it('never reads a value inherited by an accessor descriptor', () => {
    const getter = Object.defineProperty({}, 'name', { get: () => 'x' });
    const accessor: unknown[] = [];
    Object.defineProperty(accessor, '0', { get: () => 'x', enumerable: true });
    Object.defineProperty(Object.prototype, 'value', {
      value: 'polluted',
      configurable: true,
      writable: true,
    });
    try {
      expect(ownValue(getter, 'name')).toBeUndefined();
      expect(ownElements(accessor)).toBeNull();
    } finally {
      delete (Object.prototype as { value?: unknown }).value;
    }
  });
});

describe('ownStrings', () => {
  it('copies own string elements and fails on anything else', () => {
    expect(ownStrings(['a', 'b'])).toEqual(['a', 'b']);
    expect(ownStrings(['a', 1])).toBeNull();
    expect(ownStrings('a')).toBeNull();
  });
});
