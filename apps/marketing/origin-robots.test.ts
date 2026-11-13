// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import policies from '../../packages/utils/src/seo-policy.json';
import { PRIVATE_ROBOTS_HEADER } from '../../packages/utils/src/seo-robots';
import marketing from './start-bridge.config';

vi.mock('./src/lib/landing-style-map.json', () => ({
  default: {
    '/assets/full.css': {
      critical: '/assets/critical.css',
      remaining: '/assets/rest.css',
    },
  },
}));

const marker = 'x-marketing-origin-robots';
const html =
  '<html><head><meta name="robots" content="noindex"><link rel="stylesheet" href="/assets/full.css"></head><body>body</body></html>';

describe.each(['/', '/pricing'])('origin provenance on %s', (path) => {
  async function wrap(host: string, upstream?: string, noindex = '0') {
    const headers = new Headers({ 'content-type': 'text/html', [marker]: '1' });
    if (upstream !== undefined) headers.set('x-robots-tag', upstream);
    return await marketing.wrapResponse!(new Response(html, { headers }), {
      request: new Request(`https://${host}${path}`),
      env: { TUTURUUU_NOINDEX: noindex },
      seoPolicy: policies.marketing,
    });
  }
  it.each(['marketing.tuturuuu.com', 'tuturuuu-marketing.workers.dev'])(
    'marks only the private header introduced for %s',
    async (host) => {
      const response = await wrap(host);
      expect(response.headers.get('x-robots-tag')).toBe(PRIVATE_ROBOTS_HEADER);
      expect(response.headers.get(marker)).toBe('1');
      const body = await response.text();
      expect(body).toContain('<meta name="robots" content="noindex">');
      expect(body).toContain(
        path === '/' ? '/assets/critical.css' : '/assets/full.css'
      );
    }
  );
  it.each([
    'noindex',
    'none',
    'googlebot: noindex, noarchive',
    'bingbot: none',
    PRIVATE_ROBOTS_HEADER,
  ])('clears forged provenance and preserves upstream %s', async (robots) => {
    const response = await wrap('marketing.tuturuuu.com', robots);
    expect(response.headers.get('x-robots-tag')).toBe(robots);
    expect(response.headers.has(marker)).toBe(false);
  });
  it('does not mark explicit NOINDEX or canonical public responses', async () => {
    const privateResponse = await wrap(
      'marketing.tuturuuu.com',
      undefined,
      '1'
    );
    expect(privateResponse.headers.get('x-robots-tag')).toBe(
      PRIVATE_ROBOTS_HEADER
    );
    expect(privateResponse.headers.has(marker)).toBe(false);
    const publicResponse = await wrap('tuturuuu.com');
    expect(publicResponse.headers.has('x-robots-tag')).toBe(false);
    expect(publicResponse.headers.has(marker)).toBe(false);
  });
});
