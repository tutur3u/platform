import { describe, expect, it } from 'vitest';
import { parsePersistedViewport } from './viewport';

describe('parsePersistedViewport', () => {
  it('accepts a finite scroll and zoom', () => {
    expect(
      parsePersistedViewport('{"scrollX":1,"scrollY":-2,"zoom":{"value":1.5}}')
    ).toEqual({ scrollX: 1, scrollY: -2, zoom: { value: 1.5 } });
  });

  it.each([
    null,
    '',
    'nope',
    '{"scrollX":"1","scrollY":2,"zoom":{"value":1}}',
    '{"scrollX":1,"scrollY":2}',
    '{"scrollX":1,"scrollY":2,"zoom":{"value":"big"}}',
  ])('rejects %s', (value) => {
    expect(parsePersistedViewport(value)).toBeNull();
  });
});
