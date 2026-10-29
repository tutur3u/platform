import { describe, expect, it } from 'vitest';
import appConfig from '../../start-bridge.config';

const wrap = appConfig.wrapResponse;
if (!wrap) throw new Error('Pay must secure every response');

describe('Pay response security independent of staging flags', () => {
  it.each(['', '/index.html', '/Build/game.js'])(
    'keeps the upstream WebGL sandbox and removes framing denial for %s',
    async (suffix) => {
      const policy = "sandbox allow-scripts; default-src 'none'";
      const response = await wrap(
        new Response('fixture', {
          headers: {
            'content-security-policy': policy,
            'x-frame-options': 'DENY',
          },
        }),
        {
          request: new Request(
            `https://pay.staging.tutur3u.com/api/v1/workspaces/ws/external-projects/assets/asset/webgl${suffix}`
          ),
          env: { ASSETS: { fetch: async () => new Response('asset') } },
        }
      );
      expect(response.headers.get('content-security-policy')).toBe(policy);
      expect(response.headers.get('x-frame-options')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
  );

  it.each(['/webgl-extra', '/webgl;params', '/WebGL'])(
    'denies framing for the neighbouring path %s',
    async (suffix) => {
      const response = await wrap(new Response('fixture'), {
        request: new Request(
          `https://pay.staging.tutur3u.com/api/v1/workspaces/ws/external-projects/assets/asset${suffix}`
        ),
        env: { ASSETS: { fetch: async () => new Response('asset') } },
      });
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    }
  );

  it.each([undefined, '0', '1'])(
    'keeps sensitive responses private with noindex=%s',
    async (flag) => {
      const response = await wrap(
        new Response('personalized', {
          headers: { 'cache-control': 'public, max-age=3600', vary: 'Origin' },
        }),
        {
          request: new Request('https://pay.staging.tutur3u.com/en/personal'),
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
            'https://pay.staging.tutur3u.com/assets/fixture.js',
            {
              method,
            }
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
        request: new Request(
          'https://pay.staging.tutur3u.com/assets/fixture.js'
        ),
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
