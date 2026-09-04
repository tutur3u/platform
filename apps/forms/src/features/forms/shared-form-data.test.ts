import { describe, expect, it } from 'vitest';
import {
  buildSharedFormMetadata,
  getSharedFormPresentation,
} from './shared-form-data';
import { createTestFormDefinition } from './test-support/form-fixtures';

const strings = {
  brand: 'Tuturuuu Forms',
  fallbackTitle: 'Shared form',
  fallbackDescription:
    'Open this form in Tuturuuu Forms to review questions and submit a response.',
  protectedDescription:
    'Sign in to view this shared form and submit a response.',
  unavailableDescription:
    'This form may have been unpublished, closed, or removed.',
  openGraphAlt: 'Shared form preview',
};

describe('shared-form-data', () => {
  it('builds fallback metadata for unavailable forms', () => {
    const metadata = buildSharedFormMetadata({
      shareCode: 'abc123',
      form: null,
      strings,
      status: 410,
    });

    expect(metadata.title).toBe('Shared form | Tuturuuu Forms');
    expect(metadata.description).toBe(strings.unavailableDescription);
    const openGraphImages = Array.isArray(metadata.openGraph?.images)
      ? metadata.openGraph.images
      : metadata.openGraph?.images
        ? [metadata.openGraph.images]
        : [];

    expect(openGraphImages[0]).toMatchObject({
      url: 'https://forms.tuturuuu.com/f/abc123/opengraph-image',
    });
  });

  it('builds protected fallback metadata without exposing form content', () => {
    const metadata = buildSharedFormMetadata({
      shareCode: 'protected-1',
      form: null,
      strings,
      status: 401,
    });

    expect(metadata.title).toBe('Shared form | Tuturuuu Forms');
    expect(metadata.description).toBe(strings.protectedDescription);
    expect(metadata.openGraph?.description).toBe(strings.protectedDescription);
    expect(metadata.twitter?.description).toBe(strings.protectedDescription);
  });

  it('builds form-based presentation using plain-text title and description', () => {
    const presentation = getSharedFormPresentation(
      createTestFormDefinition({
        title: '<p><strong>Quarterly feedback</strong></p>',
        description: '<p>Help us improve the next release.</p>',
        shareCode: 'abc123',
        theme: {
          ...createTestFormDefinition().theme,
          coverImage: {
            storagePath: '',
            url: 'https://example.com/cover.png',
            alt: 'Cover',
          },
        },
        sections: [
          {
            id: 'section-1',
            title: 'One',
            description: '',
            image: { storagePath: '', url: '', alt: '' },
            questions: [
              {
                id: 'question-1',
                sectionId: 'section-1',
                type: 'short_text',
                title: 'Question',
                description: '',
                required: false,
                image: { storagePath: '', url: '', alt: '' },
                settings: {},
                options: [],
              },
            ],
          },
        ],
      }),
      strings
    );

    expect(presentation.title).toBe('Quarterly feedback');
    expect(presentation.description).toBe('Help us improve the next release.');
    expect(presentation.coverImageUrl).toBe('https://example.com/cover.png');
    expect(presentation.itemCount).toBe(1);
  });

  it('builds dynamic metadata title and description from form data', () => {
    const metadata = buildSharedFormMetadata({
      shareCode: 'share-1',
      status: 200,
      strings,
      form: createTestFormDefinition({
        title: '<p><strong>Employee Pulse Survey</strong></p>',
        description: '<p>Share your feedback for this sprint.</p>',
        shareCode: 'share-1',
      }),
    });

    expect(metadata.title).toBe('Employee Pulse Survey | Tuturuuu Forms');
    expect(metadata.description).toBe('Share your feedback for this sprint.');
    expect(metadata.openGraph?.title).toBe(
      'Employee Pulse Survey | Tuturuuu Forms'
    );
    expect(metadata.openGraph?.description).toBe(
      'Share your feedback for this sprint.'
    );
    expect(metadata.twitter?.title).toBe(
      'Employee Pulse Survey | Tuturuuu Forms'
    );
    expect(metadata.twitter?.description).toBe(
      'Share your feedback for this sprint.'
    );
  });

  it('marks unavailable forms as noindex', () => {
    // The page a crawler reaches for a missing or closed form is an error
    // state, not the form, so it must never be indexed regardless of what the
    // form itself configured.
    const metadata = buildSharedFormMetadata({
      shareCode: 'share-1',
      status: 404,
      strings,
      form: null,
    });

    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it('honours per-form SEO overrides', () => {
    const metadata = buildSharedFormMetadata({
      shareCode: 'share-1',
      status: 200,
      strings,
      form: createTestFormDefinition({
        title: 'Internal only',
        shareCode: 'share-1',
        seo: {
          title: 'Apply to the 2027 cohort',
          description: 'Applications close on 30 September.',
          image: {
            storagePath: 'ws/forms/social/card.png',
            url: 'https://cdn.example.com/card.png',
            alt: 'Cohort banner',
          },
          keywords: ['cohort', 'applications'],
          canonicalUrl: 'https://example.com/apply',
          noIndex: true,
        },
      }),
    });

    // An author-supplied title is used verbatim: no item count, no brand
    // suffix eating the characters a social card has room for.
    expect(metadata.title).toBe('Apply to the 2027 cohort');
    expect(metadata.description).toBe('Applications close on 30 September.');
    expect(metadata.keywords).toEqual(['cohort', 'applications']);
    expect(metadata.alternates?.canonical).toBe('https://example.com/apply');
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.openGraph?.images).toEqual([
      {
        url: 'https://cdn.example.com/card.png',
        width: 1200,
        height: 630,
        alt: 'Cohort banner',
      },
    ]);
    expect(metadata.twitter?.images).toEqual([
      'https://cdn.example.com/card.png',
    ]);
  });

  it('keeps the derived title and generated card when no overrides are set', () => {
    const metadata = buildSharedFormMetadata({
      shareCode: 'share-1',
      status: 200,
      strings,
      form: createTestFormDefinition({
        title: 'Employee Pulse Survey',
        shareCode: 'share-1',
      }),
    });

    expect(metadata.title).toBe('Employee Pulse Survey | Tuturuuu Forms');
    expect(metadata.alternates?.canonical).toContain('/f/share-1');
    expect(metadata.robots).toBeUndefined();
    expect(metadata.twitter?.images).toEqual([
      expect.stringContaining('/f/share-1/twitter-image'),
    ]);
  });
});
