import { describe, expect, it } from 'vitest';
import { resolveActiveStorefrontId } from './storefront-selection';

const storefronts = [{ id: 'primary' }, { id: 'deep-linked' }];

describe('resolveActiveStorefrontId', () => {
  it('selects the exact deep-linked storefront', () => {
    expect(resolveActiveStorefrontId(storefronts, 'deep-linked')).toBe(
      'deep-linked'
    );
  });

  it.each([null, 'missing'])('falls back to the first storefront', (value) => {
    expect(resolveActiveStorefrontId(storefronts, value)).toBe('primary');
  });

  it('returns an empty selection when there are no storefronts', () => {
    expect(resolveActiveStorefrontId([], 'deep-linked')).toBe('');
  });
});
