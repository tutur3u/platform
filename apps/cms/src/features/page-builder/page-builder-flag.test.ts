import { describe, expect, it } from 'vitest';
import { isPageBuilderEnabled } from './page-builder-flag';

describe('page builder flag', () => {
  it('is off unless the workspace config is exactly true', () => {
    expect(isPageBuilderEnabled(null)).toBe(false);
    expect(isPageBuilderEnabled(undefined)).toBe(false);
    expect(isPageBuilderEnabled('false')).toBe(false);
    expect(isPageBuilderEnabled(' TRUE ')).toBe(true);
  });
});
