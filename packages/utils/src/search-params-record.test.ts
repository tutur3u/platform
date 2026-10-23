import { describe, expect, it } from 'vitest';
import { searchParamsToRecord } from './search-params-record';

describe('searchParamsToRecord', () => {
  it('groups repeated keys into arrays by default', () => {
    expect(
      searchParamsToRecord(new URLSearchParams('q=a&userIds=1&userIds=2'))
    ).toEqual({ q: 'a', userIds: ['1', '2'] });
  });

  it('keeps the last value when repeated keys are not arrays', () => {
    expect(
      searchParamsToRecord(new URLSearchParams('page=1&page=3'), {
        repeated: 'last',
      })
    ).toEqual({ page: '3' });
  });

  it('treats prototype-named keys as inert own data', () => {
    const record = searchParamsToRecord(
      new URLSearchParams(
        '__proto__=polluted&constructor=x&toString=a&toString=b&q=ok'
      )
    );

    expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(record, '__proto__')).toBe(true);
    expect(record.constructor).toBe('x');
    expect(record.toString).toEqual(['a', 'b']);
    expect(record.q).toBe('ok');
  });
});
