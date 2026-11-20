import { describe, expect, it } from 'vitest';
import { getStudioCoverId, uploadedStudioMedia } from './entry-detail-helpers';

describe('Studio media selections', () => {
  it('assigns a cover from completed uploads when the entry has none', () => {
    expect(
      uploadedStudioMedia([
        { id: 'new-audio', asset_type: 'audio' },
        { id: 'new-cover', asset_type: 'image' },
        { id: 'new-gallery', asset_type: 'image' },
      ])
    ).toEqual({
      cover: 'new-cover',
      gallery: ['new-gallery'],
      audio: ['new-audio'],
    });
  });

  it('keeps the saved cover when images are added to the gallery', () => {
    const cover = getStudioCoverId({ studioMedia: { cover: 'saved-cover' } });
    expect(cover).toBe('saved-cover');
    expect(
      uploadedStudioMedia(
        [{ id: 'new-gallery', asset_type: 'image' }],
        cover ?? undefined
      )
    ).toMatchObject({ cover: undefined, gallery: ['new-gallery'], audio: [] });
  });
});
