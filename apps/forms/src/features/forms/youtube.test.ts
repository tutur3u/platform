import { describe, expect, it } from 'vitest';

import { parseYouTubeUrl } from './youtube';

describe('parseYouTubeUrl', () => {
  it('normalizes watch URLs and start times', () => {
    expect(
      parseYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=43s')
    ).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      startSeconds: 43,
      embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ?start=43',
    });
  });

  it('supports youtu.be share links', () => {
    expect(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({
      videoId: 'dQw4w9WgXcQ',
      startSeconds: 0,
    });
  });

  it('rejects non-youtube links', () => {
    expect(parseYouTubeUrl('https://example.com/video')).toBeNull();
  });
});
