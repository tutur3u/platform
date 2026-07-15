import { describe, expect, it } from 'vitest';
import { computeAccessibleLabelStyles } from './label-colors';

describe('tu-do label-colors', () => {
  it('returns null for undefined and null colors instead of throwing', () => {
    expect(computeAccessibleLabelStyles(undefined, false)).toBeNull();
    expect(computeAccessibleLabelStyles(null, true)).toBeNull();
  });

  it('trims named colors before resolving them', () => {
    expect(computeAccessibleLabelStyles('  blue  ', false)?.bg).toBe(
      '#3b82f61a'
    );
  });
});
