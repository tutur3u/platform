// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import { shortenerMounts } from './mounts';

describe('shortener mounts', () => {
  it('serves every production host at its root', () => {
    for (const host of [
      'ttr.gg',
      'www.ttr.gg',
      'shortener.tuturuuu.com',
      'tuturuu.com',
      'www.tuturuu.com',
      'tutur3u.com',
      'www.tutur3u.com',
    ])
      expect(
        resolveAppBase(new URL(`https://${host}/abc123`), shortenerMounts)
      ).toEqual({ mode: 'root', basePath: '' });
  });

  it('mounts the apex only under /shortener with no trailing slash', () => {
    for (const path of ['/shortener', '/shortener/abc123'])
      expect(
        resolveAppBase(new URL(`https://tuturuuu.com${path}`), shortenerMounts)
      ).toEqual({ mode: 'mounted', basePath: '/shortener' });
    for (const path of ['/', '/shortenerabc', '/shortener-extra/x', '/x'])
      expect(
        resolveAppBase(new URL(`https://tuturuuu.com${path}`), shortenerMounts)
      ).toBeNull();
  });

  it('keeps preview and workers.dev hosts at the root for staging', () => {
    expect(
      resolveAppBase(
        new URL('https://tuturuuu-shortener-vite-staging.example.workers.dev/'),
        shortenerMounts
      )
    ).toEqual({ mode: 'root', basePath: '' });
  });
});
