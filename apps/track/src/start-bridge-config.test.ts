// @vitest-environment node
import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import { PRIVATE_ROBOTS_HEADER } from '@tuturuuu/utils/seo';
import { describe, expect, it } from 'vitest';
import appConfig, {
  decorateTrackResponse,
  trackMounts,
} from '../start-bridge.config';

const decorate = (url: string, headers?: HeadersInit) =>
  decorateTrackResponse(new Response('x', { headers }), new Request(url));

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
          ' Tuturuuu-Track-Vite-Staging.ops.workers.dev, evil.example, *.workers.dev, track-staging.tuturuuu.com:443, track-staging.tuturuuu.com',
      })
    ).toEqual({
      rootHosts: [
        'track.tuturuuu.com',
        'tuturuuu-track-vite-staging.ops.workers.dev',
        'track-staging.tuturuuu.com',
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

  it('keeps a handler CSP and leaves the framable WebGL path frameable', async () => {
    const withCsp = await decorate('https://track.tuturuuu.com/personal', {
      'content-security-policy': "default-src 'self'",
    });
    const webgl = await decorate(
      'https://track.tuturuuu.com/api/v1/workspaces/ws/external-projects/assets/a/webgl'
    );

    expect(withCsp.headers.get('content-security-policy')).toBe(
      "default-src 'self'"
    );
    expect(webgl.headers.has('x-frame-options')).toBe(false);
    expect(webgl.headers.has('content-security-policy')).toBe(false);
    expect(webgl.headers.get('x-robots-tag')).toBe(PRIVATE_ROBOTS_HEADER);
  });
});
