// @vitest-environment node
import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import { PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo';
import { describe, expect, it } from 'vitest';
import appConfig, {
  decorateTrackResponse,
  denyFraming,
  trackMounts,
} from '../start-bridge.config';

const decorate = (url: string, headers?: HeadersInit, method = 'GET') =>
  decorateTrackResponse(
    new Response('x', { headers }),
    new Request(url, { method })
  );

describe('Track Worker mounts (root-only, fail-closed)', () => {
  it('serves only the subdomain root and rejects every other host', () => {
    const mounts = { app: 'track', ...trackMounts({}) };

    expect(appConfig.mounts).toEqual(trackMounts({}));
    expect(
      resolveAppBase(new URL('https://track.tuturuuu.com/personal'), mounts)
    ).toEqual({ mode: 'root', basePath: '' });
    for (const url of [
      'https://tuturuuu.com/track/personal',
      'https://tuturuuu.com/api/build-info',
      'https://evil.example/',
      'https://track.tuturuuu.com.evil.example/',
      'https://tuturuuu-track-vite-staging.someone.workers.dev/',
    ])
      expect(resolveAppBase(new URL(url), mounts)).toBeNull();
  });

  it('admits only valid staging hostnames from the Worker var', () => {
    expect(
      trackMounts({
        TUTURUUU_STAGING_HOSTS:
          ' Tuturuuu-Track-Vite-Staging.ops.workers.dev, evil.example, *.workers.dev, track.staging.tutur3u.com:443, track.staging.tutur3u.com',
      })
    ).toEqual({
      rootHosts: [
        'track.tuturuuu.com',
        'tuturuuu-track-vite-staging.ops.workers.dev',
        'track.staging.tutur3u.com',
      ],
      mountHosts: [],
      unknownHost: 'reject',
    });
  });
});

describe('Track Worker response policy', () => {
  it('sends the production header set on every response', async () => {
    const response = await decorate('https://track.tuturuuu.com/personal');

    expect(Object.fromEntries(response.headers)).toMatchObject({
      'x-robots-tag': PRIVATE_ROBOTS_HEADER,
      'content-security-policy': "frame-ancestors 'none'",
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'strict-transport-security': 'max-age=63072000',
      'cache-control': 'private, no-store, max-age=0',
    });
  });

  it.each([
    'private, max-age=60, stale-while-revalidate=30',
    'public, max-age=31536000, immutable',
    'no-store',
  ])(
    'replaces a dynamic response cache policy with no-store: %s',
    async (policy) => {
      const response = await decorate(
        'https://track.tuturuuu.com/api/v1/workspaces/personal/time-tracking/stats/summary',
        { 'cache-control': policy }
      );

      expect(response.headers.get('cache-control')).toBe(
        'private, no-store, max-age=0'
      );
    }
  );

  it.each(['/assets/index-abc.js', '/favicon.ico', '/media/logos/light.png'])(
    'keeps asset caching: %s',
    async (path) => {
      const response = await decorate(`https://track.tuturuuu.com${path}`, {
        'cache-control': 'public, max-age=31536000, immutable',
      });

      expect(response.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable'
      );
    }
  );

  it.each([
    ['POST', '/assets/index-abc.js'],
    ['PUT', '/assets/index-abc.js'],
    ['POST', '/favicon.ico'],
    ['DELETE', '/robots.txt'],
  ])('stores no %s response on an asset path: %s', async (method, path) => {
    const response = await decorate(
      `https://track.tuturuuu.com${path}`,
      { 'cache-control': 'public, max-age=31536000, immutable' },
      method
    );

    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    );
  });

  it('keeps asset caching for HEAD', async () => {
    const response = await decorate(
      'https://track.tuturuuu.com/assets/index-abc.js',
      { 'cache-control': 'public, max-age=31536000, immutable' },
      'HEAD'
    );

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
  });

  it.each([
    ["default-src 'self'", "default-src 'self'; frame-ancestors 'none'"],
    [
      "default-src 'self'; frame-ancestors https://evil.example; img-src *",
      "default-src 'self'; img-src *; frame-ancestors 'none'",
    ],
    ['FRAME-ANCESTORS *', "frame-ancestors 'none'"],
    [
      "script-src 'nonce-a', frame-ancestors *; style-src 'self'",
      "script-src 'nonce-a'; frame-ancestors 'none', style-src 'self'; frame-ancestors 'none'",
    ],
  ])(
    'keeps an existing CSP but enforces frame-ancestors none: %s',
    async (csp, expected) => {
      const response = await decorate('https://track.tuturuuu.com/personal', {
        'content-security-policy': csp,
      });

      expect(response.headers.get('content-security-policy')).toBe(expected);
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    }
  );

  it('denies framing when there is no CSP', () => {
    expect(denyFraming(null)).toBe("frame-ancestors 'none'");
    expect(denyFraming(' ; , ')).toBe("frame-ancestors 'none'");
  });

  it('leaves the framable WebGL path frameable', async () => {
    const webgl = await decorate(
      'https://track.tuturuuu.com/api/v1/workspaces/ws/external-projects/assets/a/webgl',
      { 'content-security-policy': "default-src 'self'" }
    );

    expect(webgl.headers.has('x-frame-options')).toBe(false);
    expect(webgl.headers.get('content-security-policy')).toBe(
      "default-src 'self'"
    );
    expect(webgl.headers.get('x-robots-tag')).toBe(PRIVATE_ROBOTS_HEADER);
  });
});
