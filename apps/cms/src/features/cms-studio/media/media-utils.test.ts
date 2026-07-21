import { describe, expect, it } from 'vitest';
import { getMediaName, getMediaType } from './media-utils';

describe('CMS media helpers', () => {
  it('classifies image, audio, and other files without treating every file as an image', () => {
    expect(getMediaType({ asset_type: 'image' })).toBe('image');
    expect(getMediaType({ asset_type: 'AUDIO' })).toBe('audio');
    expect(getMediaType({ asset_type: 'webgl' })).toBe('other');
  });

  it('uses a readable decoded filename when available', () => {
    expect(
      getMediaName({
        asset_type: 'image',
        source_url: null,
        storage_path: 'external-projects/art/My%20cover.png',
      })
    ).toBe('My cover.png');
  });

  it('falls back safely for malformed URLs and missing filenames', () => {
    expect(
      getMediaName({
        asset_type: 'audio',
        source_url: 'https://example.com/%E0%A4%A',
        storage_path: null,
      })
    ).toBe('%E0%A4%A');
    expect(
      getMediaName({
        asset_type: 'document',
        source_url: null,
        storage_path: null,
      })
    ).toBe('document');
  });
});
