import { describe, expect, it } from 'vitest';
import { searchParamsToRecord } from './search-params-record';

describe('searchParamsToRecord', () => {
  it('keeps the last value for repeated keys by default', () => {
    expect(
      searchParamsToRecord(new URLSearchParams('page=1&page=2&q=milk'))
    ).toEqual({ page: '2', q: 'milk' });
  });

  it('collects repeated keys into arrays in multi mode', () => {
    expect(
      searchParamsToRecord(
        new URLSearchParams('userIds=a&userIds=b&userIds=c&page=1'),
        { multi: true }
      )
    ).toEqual({ page: '1', userIds: ['a', 'b', 'c'] });
  });

  it('keeps prototype-named keys as own properties', () => {
    for (const multi of [false, true]) {
      const record = searchParamsToRecord(
        new URLSearchParams(
          '__proto__=x&__proto__=y&constructor=z&page=1&toString=w'
        ),
        { multi }
      );

      expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
      expect(Object.hasOwn(record, '__proto__')).toBe(true);
      expect(
        Object.getOwnPropertyDescriptor(record, '__proto__')?.value
      ).toEqual(multi ? ['x', 'y'] : 'y');
      expect(record.constructor).toBe('z');
      expect(record.page).toBe('1');
    }
  });
});
