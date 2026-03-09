import { describe, expect, it } from 'vitest';
import {
  buildSharedFormMetadata,
  getSharedFormPresentation,
} from './shared-form-data';

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
      locale: 'en',
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
      url: 'https://tuturuuu.com/en/shared/forms/abc123/opengraph-image',
    });
  });

  it('builds form-based presentation using plain-text title and description', () => {
    const presentation = getSharedFormPresentation(
      {
        id: 'form-1',
        wsId: 'ws-1',
        creatorId: 'user-1',
        title: '<p><strong>Quarterly feedback</strong></p>',
        description: '<p>Help us improve the next release.</p>',
        status: 'published',
        accessMode: 'anonymous',
        openAt: null,
        closeAt: null,
        maxResponses: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        shareCode: 'abc123',
        theme: {
          presetId: 'editorial-moss',
          density: 'balanced',
          accentColor: 'dynamic-green',
          headlineFontId: 'noto-serif',
          bodyFontId: 'be-vietnam-pro',
          surfaceStyle: 'paper',
          coverHeadline: '',
          coverImage: {
            storagePath: '',
            url: 'https://example.com/cover.png',
            alt: 'Cover',
          },
          sectionImages: {},
          typography: {
            displaySize: 'md',
            headingSize: 'md',
            bodySize: 'md',
          },
        },
        settings: {
          showProgressBar: true,
          allowMultipleSubmissions: true,
          oneResponsePerUser: false,
          requireTurnstile: true,
          confirmationTitle: 'Thanks',
          confirmationMessage: 'Done',
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
        logicRules: [],
      },
      strings
    );

    expect(presentation.title).toBe('Quarterly feedback');
    expect(presentation.description).toBe('Help us improve the next release.');
    expect(presentation.coverImageUrl).toBe('https://example.com/cover.png');
    expect(presentation.itemCount).toBe(1);
  });

  it('builds dynamic metadata title and description from form data', () => {
    const metadata = buildSharedFormMetadata({
      locale: 'en',
      shareCode: 'share-1',
      status: 200,
      strings,
      form: {
        id: 'form-2',
        wsId: 'ws-1',
        creatorId: 'user-1',
        title: '<p><strong>Employee Pulse Survey</strong></p>',
        description: '<p>Share your feedback for this sprint.</p>',
        status: 'published',
        accessMode: 'anonymous',
        openAt: null,
        closeAt: null,
        maxResponses: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        shareCode: 'share-1',
        theme: {
          presetId: 'editorial-moss',
          density: 'balanced',
          accentColor: 'dynamic-green',
          headlineFontId: 'noto-serif',
          bodyFontId: 'be-vietnam-pro',
          surfaceStyle: 'paper',
          coverHeadline: '',
          coverImage: {
            storagePath: '',
            url: '',
            alt: '',
          },
          sectionImages: {},
          typography: {
            displaySize: 'md',
            headingSize: 'md',
            bodySize: 'md',
          },
        },
        settings: {
          showProgressBar: true,
          allowMultipleSubmissions: true,
          oneResponsePerUser: false,
          requireTurnstile: true,
          confirmationTitle: 'Thanks',
          confirmationMessage: 'Done',
        },
        sections: [],
        logicRules: [],
      },
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
});
