import { describe, expect, it, vi } from 'vitest';

// Mirrors next/og: caller headers are spread over its lowercase defaults.
vi.mock('next/og', () => ({
  ImageResponse: class extends Response {
    constructor(
      _element: unknown,
      options: { headers?: Record<string, string> } = {}
    ) {
      super('png', {
        headers: {
          'content-type': 'image/png',
          'cache-control': 'public, immutable, no-transform, max-age=31536000',
          ...options.headers,
        },
      });
    }
  },
}));

import { buildMeetOgContent } from './og-content';
import { renderMeetOgImage } from './og-response';

const info = {
  title: 'Weekly sync',
  scheduledAt: '2026-11-23T14:05:00Z',
  ended: false,
};

describe('renderMeetOgImage', () => {
  it('replaces the default policy with the short detail-card policy', () => {
    const response = renderMeetOgImage(
      buildMeetOgContent({ kind: 'room', info }, 'en')
    );
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=300, s-maxage=300'
    );
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('caches generic room cards for a day and keeps them out of search', () => {
    const response = renderMeetOgImage(
      buildMeetOgContent({ kind: 'room', info: null }, 'vi')
    );
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
    );
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('lets the landing card be indexed', () => {
    const response = renderMeetOgImage(
      buildMeetOgContent({ kind: 'landing' }, 'en')
    );
    expect(response.headers.get('Cache-Control')).not.toContain('immutable');
    expect(response.headers.get('X-Robots-Tag')).toBeNull();
  });
});
