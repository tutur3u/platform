import { describe, expect, it } from 'vitest';
import { resolveNativeProfile } from './native-profile';

describe('teach native profile', () => {
  it('defaults to the isolated staging Worker', () => {
    expect(resolveNativeProfile(undefined)).toEqual({
      name: 'staging',
      workerName: 'tuturuuu-teach-vite-staging',
      noindex: '1',
    });
  });

  it('selects production only when asked', () => {
    expect(resolveNativeProfile('production')).toEqual({
      name: 'production',
      workerName: 'tuturuuu-teach',
      noindex: '0',
    });
  });

  it('rejects a mistyped profile', () => {
    expect(() => resolveNativeProfile('prod')).toThrow(/Unknown/);
  });
});
