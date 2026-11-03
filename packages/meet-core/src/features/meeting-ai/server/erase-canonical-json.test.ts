import { describe, expect, it } from 'vitest';
import { canonicalEraseJson } from './erase-canonical-json';

describe('canonical erase JSON', () => {
  it('sorts recursively, preserves array order and emits no insignificant whitespace', () => {
    const expected = '{"a":[{"a":null,"b":true},2,1],"z":"line\\n"}';
    expect(
      canonicalEraseJson({ z: 'line\n', a: [{ b: true, a: null }, 2, 1] })
    ).toBe(expected);
    expect(
      canonicalEraseJson({ a: [{ a: null, b: true }, 2, 1], z: 'line\n' })
    ).toBe(expected);
  });
  it('sorts numeric-looking keys lexically', () => {
    expect(canonicalEraseJson({ '2': 2, '10': 10 })).toBe('{"10":10,"2":2}');
  });
  it('preserves strings including lowercase UUIDs without normalizing content', () => {
    expect(
      canonicalEraseJson({
        id: '11111111-1111-4111-8111-111111111111',
        text: 'Tiếng Việt',
      })
    ).toBe('{"id":"11111111-1111-4111-8111-111111111111","text":"Tiếng Việt"}');
  });
  it.each([
    undefined,
    NaN,
    Infinity,
    1n,
    new Date(0),
    { missing: undefined },
    [undefined],
    new Array(1),
  ])('refuses values outside JSON', (value) => {
    expect(() => canonicalEraseJson(value)).toThrow('MEET_ERASE_INVALID_JSON');
  });
  it('refuses cycles but allows repeated objects', () => {
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(() => canonicalEraseJson(cycle)).toThrow('MEET_ERASE_INVALID_JSON');
    const shared = { b: 1 };
    expect(canonicalEraseJson([shared, shared])).toBe('[{"b":1},{"b":1}]');
  });
});
