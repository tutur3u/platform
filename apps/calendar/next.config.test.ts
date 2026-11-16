// @vitest-environment node
import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('Calendar Next deployment path', () => {
  it('retains the canonical base path through the shared config and intl plugin', () => {
    expect(nextConfig.basePath).toBe('/calendar');
    expect(nextConfig.trailingSlash).not.toBe(true);
  });

  it('keeps app auth routes ahead of the central API fallback', async () => {
    const rewrites = await nextConfig.rewrites?.();
    expect(rewrites).toBeDefined();
    expect(Array.isArray(rewrites)).toBe(false);
    if (!rewrites || Array.isArray(rewrites)) {
      throw new Error('Calendar requires phased rewrites');
    }
    expect(rewrites.afterFiles).toEqual([]);
    expect(rewrites.fallback).toEqual([
      expect.objectContaining({ source: '/api/:path*' }),
    ]);
  });
});
