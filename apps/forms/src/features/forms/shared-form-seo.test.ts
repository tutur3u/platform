import { describe, expect, it } from 'vitest';
import type { FormSeoInput } from './schema';
import { hasFormSeoOverrides, resolveFormSeo } from './shared-form-seo';

const derived = {
  description: 'Derived description',
  keywords: ['derived'],
  title: 'Derived title',
};

function seo(overrides: Partial<FormSeoInput> = {}): FormSeoInput {
  return {
    title: '',
    description: '',
    image: { storagePath: '', url: '', alt: '' },
    keywords: [],
    canonicalUrl: '',
    noIndex: false,
    ...overrides,
  };
}

describe('resolveFormSeo', () => {
  it('falls back to derived values when no overrides are set', () => {
    const result = resolveFormSeo({
      derived,
      fallbackImageAlt: 'Fallback alt',
      seo: seo(),
    });

    expect(result).toEqual({
      canonicalUrl: null,
      description: 'Derived description',
      imageAlt: 'Fallback alt',
      imageUrl: null,
      keywords: ['derived'],
      noIndex: false,
      title: 'Derived title',
    });
  });

  it('treats a missing seo object the same as an empty one', () => {
    const result = resolveFormSeo({
      derived,
      fallbackImageAlt: 'Fallback alt',
      seo: null,
    });

    expect(result.title).toBe('Derived title');
    expect(result.noIndex).toBe(false);
  });

  it('prefers overrides when they are set', () => {
    const result = resolveFormSeo({
      derived,
      fallbackImageAlt: 'Fallback alt',
      seo: seo({
        canonicalUrl: 'https://example.com/apply',
        description: 'Custom description',
        image: {
          alt: 'Custom alt',
          storagePath: 'ws/forms/social/card.png',
          url: 'https://cdn.example.com/card.png',
        },
        keywords: ['hiring', 'engineering'],
        noIndex: true,
        title: 'Custom title',
      }),
    });

    expect(result).toEqual({
      canonicalUrl: 'https://example.com/apply',
      description: 'Custom description',
      imageAlt: 'Custom alt',
      imageUrl: 'https://cdn.example.com/card.png',
      keywords: ['hiring', 'engineering'],
      noIndex: true,
      title: 'Custom title',
    });
  });

  it('treats whitespace-only overrides as unset', () => {
    const result = resolveFormSeo({
      derived,
      fallbackImageAlt: 'Fallback alt',
      seo: seo({ canonicalUrl: '   ', description: '   ', title: '   ' }),
    });

    expect(result.title).toBe('Derived title');
    expect(result.description).toBe('Derived description');
    expect(result.canonicalUrl).toBeNull();
  });

  it('ignores an unsigned storage path so the generated card is used', () => {
    // The media resolver signs `storagePath` into `url` on read. When signing
    // fails there is no usable URL, and emitting the raw path would produce a
    // broken social card instead of falling back to the generated one.
    const result = resolveFormSeo({
      derived,
      fallbackImageAlt: 'Fallback alt',
      seo: seo({
        image: { alt: '', storagePath: 'ws/forms/social/card.png', url: '' },
      }),
    });

    expect(result.imageUrl).toBeNull();
  });
});

describe('hasFormSeoOverrides', () => {
  it('is false for an empty or missing configuration', () => {
    expect(hasFormSeoOverrides(seo())).toBe(false);
    expect(hasFormSeoOverrides(null)).toBe(false);
  });

  it.each([
    ['title', seo({ title: 'x' })],
    ['description', seo({ description: 'x' })],
    ['keywords', seo({ keywords: ['x'] })],
    ['canonicalUrl', seo({ canonicalUrl: 'https://example.com' })],
    ['noIndex', seo({ noIndex: true })],
    ['image', seo({ image: { alt: '', storagePath: 'p', url: '' } })],
  ])('is true when %s is set', (_field, value) => {
    expect(hasFormSeoOverrides(value)).toBe(true);
  });
});
