import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePositiveIntEnv } from '../positive-int-env';

describe('parsePositiveIntEnv', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads a plain positive integer', () => {
    vi.stubEnv('LIMIT_UNDER_TEST', ' 42 ');
    expect(parsePositiveIntEnv('LIMIT_UNDER_TEST', 7)).toBe(42);
  });

  it('keeps the fallback for junk, zero, negative and fractions', () => {
    for (const value of ['12abc', '0', '-5', '1.5', 'NaN', '1e3', '']) {
      vi.stubEnv('LIMIT_UNDER_TEST', value);
      expect(parsePositiveIntEnv('LIMIT_UNDER_TEST', 7)).toBe(7);
    }
  });

  it('reads aliases in order only while the primary is unset', () => {
    vi.stubEnv('LIMIT_ALIAS_A', 'junk');
    vi.stubEnv('LIMIT_ALIAS_B', '9');
    expect(
      parsePositiveIntEnv('LIMIT_UNSET', 7, ['LIMIT_ALIAS_A', 'LIMIT_ALIAS_B'])
    ).toBe(9);
    vi.stubEnv('LIMIT_UNSET', '0');
    expect(
      parsePositiveIntEnv('LIMIT_UNSET', 7, ['LIMIT_ALIAS_A', 'LIMIT_ALIAS_B'])
    ).toBe(7);
  });
});
