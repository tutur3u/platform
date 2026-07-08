import { describe, expect, it } from 'vitest';
import { externalProjectAdapterFixtures } from './fixtures';

describe('external project adapter fixtures', () => {
  it('covers all supported adapters with source references', () => {
    expect(Object.keys(externalProjectAdapterFixtures).sort()).toEqual([
      'exocorpse',
      'junly',
      'kendra',
      'richfield',
      'shiraoki',
      'shu',
      'theguyser',
      'yashie',
      'yoola',
    ]);

    for (const fixture of Object.values(externalProjectAdapterFixtures)) {
      expect(fixture.sourceReference).toMatch(
        /(junly|yoola|theguyser|exocorpse|shu|yashie|shiraoki|kendra|Richfield)/
      );
      expect(fixture.collections.length).toBeGreaterThan(0);
    }
  });

  it('matches the expected collection layout for each adapter', () => {
    expect(
      externalProjectAdapterFixtures.junly.collections.map(
        (collection) => collection.slug
      )
    ).toEqual([
      'research-projects',
      'game-projects',
      'artworks',
      'feed-posts',
      'music-tracks',
      'singleton-sections',
    ]);

    expect(
      externalProjectAdapterFixtures.yoola.collections.map(
        (collection) => collection.slug
      )
    ).toEqual(['artworks', 'lore-capsules', 'singleton-sections']);

    expect(
      externalProjectAdapterFixtures.theguyser.collections.map(
        (collection) => collection.slug
      )
    ).toEqual([
      'panel-content',
      'awards',
      'gallery',
      'experience',
      'contact-social',
    ]);

    expect(
      externalProjectAdapterFixtures.exocorpse.collections.map(
        (collection) => collection.slug
      )
    ).toEqual(['portfolio-art', 'writing', 'games']);

    expect(
      externalProjectAdapterFixtures.shiraoki.collections.map(
        (collection) => collection.slug
      )
    ).toEqual([
      'site-config',
      'launch-gate',
      'navigation',
      'editorial-sections',
      'shopify-settings',
    ]);

    expect(
      externalProjectAdapterFixtures.kendra.collections.map(
        (collection) => collection.slug
      )
    ).toEqual(['profile', 'voice-reels', 'credits', 'studio', 'contact']);

    expect(
      externalProjectAdapterFixtures.richfield.collections.map(
        (collection) => collection.slug
      )
    ).toEqual([
      'brands',
      'leadership',
      'milestones',
      'contact-page',
      'contact-channels',
      'contact-submissions',
      'jobs',
      'image-library',
    ]);

    expect(
      externalProjectAdapterFixtures.shu.collections.map(
        (collection) => collection.slug
      )
    ).toEqual(['games']);

    expect(
      externalProjectAdapterFixtures.yashie.collections.map(
        (collection) => collection.slug
      )
    ).toEqual([
      'profile',
      'blog-posts',
      'gallery',
      'shop-products',
      'writing-worlds',
      'social-links',
    ]);
  });

  it('ships Yashie field definitions for each CMS proof collection', () => {
    expect(
      externalProjectAdapterFixtures.yashie.schema?.collections.map(
        (collection) => [
          collection.slug,
          collection.profileFields?.map((field) => field.key) ?? [],
          collection.metadataFields?.map((field) => field.key) ?? [],
        ]
      )
    ).toEqual([
      [
        'profile',
        [
          'displayName',
          'tagline',
          'location',
          'commissionStatus',
          'featuredGallerySlugs',
        ],
        ['seoTitle', 'seoDescription'],
      ],
      [
        'blog-posts',
        ['author', 'publishedOn', 'tags', 'featured'],
        ['seoTitle', 'seoDescription'],
      ],
      ['gallery', ['medium', 'style', 'completedOn', 'featured'], ['credit']],
      [
        'shop-products',
        ['price', 'currency', 'available', 'variants'],
        ['sku'],
      ],
      ['writing-worlds', ['genre', 'status', 'contentWarnings'], []],
      ['social-links', ['url', 'platform', 'isPrimary'], ['rel']],
    ]);
  });

  it('ships Richfield field definitions for the CMS test collections', () => {
    expect(
      externalProjectAdapterFixtures.richfield.schema?.collections.map(
        (collection) => [
          collection.slug,
          collection.profileFields?.map((field) => field.key) ?? [],
          collection.blockTypes ?? [],
          collection.assetTypes ?? [],
        ]
      )
    ).toEqual([
      [
        'brands',
        ['country', 'year', 'category', 'accent', 'feature', 'featureCaption'],
        [],
        ['image'],
      ],
      ['leadership', ['role'], ['markdown', 'quote'], ['image']],
      ['milestones', ['year', 'country', 'brand', 'aboutOnly'], [], []],
      [
        'contact-page',
        ['headline', 'intro', 'mapQuery', 'backgroundImageSlug'],
        ['markdown'],
        ['image'],
      ],
      [
        'contact-channels',
        ['kind', 'href', 'secondary', 'cta', 'external', 'sortOrder'],
        [],
        [],
      ],
      [
        'contact-submissions',
        [
          'name',
          'company',
          'country',
          'email',
          'inquiryType',
          'receivedAt',
          'submissionStatus',
          'emailNotificationStatus',
        ],
        ['markdown'],
        [],
      ],
      [
        'jobs',
        ['positions', 'location', 'deadline', 'href', 'sortOrder'],
        [],
        [],
      ],
      [
        'image-library',
        [
          'pageSection',
          'placement',
          'brand',
          'category',
          'productName',
          'feature',
          'shelfWeight',
          'usageTags',
          'objectPosition',
          'ratio',
          'credit',
          'sortOrder',
        ],
        [],
        ['image'],
      ],
    ]);
  });

  it('ships Kendra audio-first schema for voice-over reels', () => {
    expect(
      externalProjectAdapterFixtures.kendra.schema?.collections.map(
        (collection) => [
          collection.slug,
          collection.assetTypes ?? null,
          collection.profileFields?.map((field) => field.key) ?? [],
        ]
      )
    ).toEqual([
      [
        'profile',
        ['image'],
        ['email', 'location', 'tagline', 'gvaaUrl', 'resumeUrl'],
      ],
      [
        'voice-reels',
        ['audio'],
        ['category', 'duration', 'style', 'featured', 'downloadLabel'],
      ],
      ['credits', [], ['group', 'role', 'visual']],
      ['studio', [], ['kind', 'label', 'value']],
      ['contact', [], ['email', 'gvaaUrl']],
    ]);
  });
});
