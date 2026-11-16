import { afterEach, describe, expect, it, vi } from 'vitest';
import * as buildInfo from './build-info/route';

const commit = '0123456789abcdef0123456789abcdef01234567';

afterEach(() => vi.unstubAllEnvs());

describe('public build-info route', () => {
  it('exports only GET and HEAD', () => {
    expect(Object.keys(buildInfo).sort()).toEqual(['GET', 'HEAD']);
  });

  it('returns only the source commit and platform without caching or cookies', async () => {
    vi.stubEnv('PLATFORM_BUILD_COMMIT_HASH', commit);
    const response = buildInfo.GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ commit, platform: 'cloudflare' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('returns the same metadata headers with no body for HEAD', async () => {
    vi.stubEnv('PLATFORM_BUILD_COMMIT_HASH', commit);
    const response = buildInfo.HEAD();

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-type')).toBe(
      buildInfo.GET().headers.get('content-type')
    );
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it.each([
    undefined,
    '',
    'not-a-commit',
    'a'.repeat(39),
    'a'.repeat(41),
    'A'.repeat(40),
  ])('fails closed for invalid source commit %s', async (value) => {
    vi.stubEnv('PLATFORM_BUILD_COMMIT_HASH', value);
    for (const handler of [buildInfo.GET, buildInfo.HEAD]) {
      const response = handler();
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.text()).toBe('');
    }
  });
});
