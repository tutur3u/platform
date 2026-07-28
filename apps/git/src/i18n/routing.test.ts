import { describe, expect, it } from 'vitest';
import { routing } from './routing';

describe('Git locale routing', () => {
  it('keeps locale prefixes out of public URLs', () => {
    expect(routing.localePrefix).toBe('never');
  });
});
