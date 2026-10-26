import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/internal-api', () => ({
  getAiChatSignedReadUrls: vi.fn(),
}));

import { parseGeneratedImageSource } from '../use-generated-image-url';

const WS = '5707a6e0-0000-4000-8000-000000009711';

describe('parseGeneratedImageSource', () => {
  it('prefers a direct mira/images storagePath and keeps imageUrl as fallback', () => {
    expect(
      parseGeneratedImageSource({
        imageUrl: 'https://stored/old',
        storagePath: `${WS}/mira/images/a.png`,
      })
    ).toEqual({
      imageUrl: 'https://stored/old',
      storagePath: `${WS}/mira/images/a.png`,
    });
  });

  it.each([
    ['missing', undefined],
    ['other root', `${WS}/drive/mira/qr/a.png`],
    ['nested', `${WS}/mira/images/x/a.png`],
    ['no workspace', 'mira/images/a.png'],
  ])('ignores a %s storagePath', (_, storagePath) => {
    expect(
      parseGeneratedImageSource({ imageUrl: 'https://stored/old', storagePath })
    ).toEqual({ imageUrl: 'https://stored/old', storagePath: null });
  });

  it('handles outputs without any image source', () => {
    expect(parseGeneratedImageSource(null)).toEqual({
      imageUrl: null,
      storagePath: null,
    });
  });
});
