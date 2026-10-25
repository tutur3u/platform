import { describe, expect, it } from 'vitest';
import appConfig from '../../start-bridge.config';

const wrap = appConfig.wrapResponse;
if (!wrap) throw new Error('Finance must secure every response');

describe('Finance response security independent of staging flags', () => {
  it.each([undefined, '0', '1'])(
    'keeps sensitive responses private with noindex=%s',
    async (flag) => {
      const response = await wrap(
        new Response('personalized', {
          headers: { 'cache-control': 'public, max-age=3600', vary: 'Origin' },
        }),
        {
          request: new Request('https://finance.tuturuuu.com/en/personal'),
          env: {
            ASSETS: { fetch: async () => new Response('asset') },
            ...(flag === undefined ? {} : { TUTURUUU_NOINDEX: flag }),
          },
        }
      );
      expect(await response.text()).toBe('personalized');
      expect(response.headers.get('x-robots-tag')).toBe(
        'noindex, nofollow, nosnippet'
      );
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('referrer-policy')).toBe(
        'strict-origin-when-cross-origin'
      );
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('vary')).toContain('Origin');
      expect(response.headers.get('vary')).toContain('Cookie');
    }
  );

  it.each(['POST', 'PUT', 'DELETE'])(
    'does not classify %s asset responses as cacheable files',
    async (method) => {
      const response = await wrap(
        new Response('personalized', {
          headers: {
            'content-type': 'application/json',
            'cache-control': 'public, max-age=3600',
          },
        }),
        {
          request: new Request(
            'https://finance.tuturuuu.com/assets/fixture.js',
            { method }
          ),
          env: { ASSETS: { fetch: async () => new Response('asset') } },
        }
      );
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('vary')).toContain('Cookie');
    }
  );

  it('preserves compiled static caching while retaining security headers', async () => {
    const response = await wrap(
      new Response('export {}', {
        headers: {
          'content-type': 'text/javascript',
          'cache-control': 'public, max-age=31536000, immutable',
        },
      }),
      {
        request: new Request('https://finance.tuturuuu.com/assets/fixture.js'),
        env: { ASSETS: { fetch: async () => new Response('asset') } },
      }
    );
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-robots-tag')).toBe(
      'noindex, nofollow, nosnippet'
    );
  });
});
