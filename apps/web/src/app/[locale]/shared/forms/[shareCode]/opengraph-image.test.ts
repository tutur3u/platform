import { describe, expect, it, vi } from 'vitest';

const mockGetTranslations = vi.hoisted(() => vi.fn());
const mockLoadSharedFormSnapshot = vi.hoisted(() => vi.fn());
const mockCreateSharedFormSocialImage = vi.hoisted(() => vi.fn());

vi.mock('next-intl/server', () => ({
  getTranslations: mockGetTranslations,
}));

vi.mock('./shared-form-loader', () => ({
  loadSharedFormSnapshot: mockLoadSharedFormSnapshot,
}));

vi.mock('./shared-form-social-image', () => ({
  contentType: 'image/png',
  size: { width: 1200, height: 630 },
  createSharedFormSocialImage: mockCreateSharedFormSocialImage,
}));

import Image, { dynamic } from './opengraph-image';

describe('opengraph-image', () => {
  it('uses the direct shared-form snapshot loader and stays dynamic', async () => {
    const translate = (key: string, values?: Record<string, string>) => {
      if (key === 'shared.open_graph_alt') {
        return `alt:${values?.title ?? ''}`;
      }
      return key;
    };

    mockGetTranslations.mockResolvedValue(translate);
    mockLoadSharedFormSnapshot.mockResolvedValue({
      status: 200,
      data: {
        form: {
          title: '<p>Live title</p>',
          description: '<p>Live description</p>',
          theme: {
            accentColor: 'dynamic-green',
            coverHeadline: '',
            coverImage: { storagePath: '', url: '', alt: '' },
          },
          sections: [],
        },
      },
    });
    mockCreateSharedFormSocialImage.mockResolvedValue('image-response');

    const response = await Image({
      params: Promise.resolve({ shareCode: 'share-1' }),
    });

    expect(dynamic).toBe('force-dynamic');
    expect(mockLoadSharedFormSnapshot).toHaveBeenCalledWith('share-1');
    expect(mockCreateSharedFormSocialImage).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        form: expect.objectContaining({
          title: '<p>Live title</p>',
        }),
      })
    );
    expect(response).toBe('image-response');
  });
});
