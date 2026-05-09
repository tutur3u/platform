import { describe, expect, it } from 'vitest';
import { resolveCmsWebAppUrl } from './resolve-web-app-url';

describe('resolveCmsWebAppUrl', () => {
  it('falls back to the central production web app when NEXT_PUBLIC_APP_URL points at CMS', () => {
    expect(
      resolveCmsWebAppUrl({
        NEXT_PUBLIC_APP_URL: 'https://cms.tuturuuu.com',
        NODE_ENV: 'production',
      })
    ).toBe('https://tuturuuu.com');
  });

  it('does not route preview API rewrites back to the current Vercel deployment', () => {
    expect(
      resolveCmsWebAppUrl({
        NEXT_PUBLIC_APP_URL: 'https://cms-preview.vercel.app',
        VERCEL: '1',
        VERCEL_URL: 'cms-preview.vercel.app',
      })
    ).toBe('https://tuturuuu.com');
  });

  it('honors an explicit central web app origin', () => {
    expect(
      resolveCmsWebAppUrl({
        NEXT_PUBLIC_APP_URL: 'https://cms.tuturuuu.com',
        NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.com/',
        NODE_ENV: 'production',
      })
    ).toBe('https://tuturuuu.com');
  });

  it('uses the central local port when the local app URL points at CMS', () => {
    expect(
      resolveCmsWebAppUrl({
        CENTRAL_PORT: '7803',
        NEXT_PUBLIC_APP_URL: 'http://localhost:7811',
        NODE_ENV: 'development',
        PORT: '7811',
      })
    ).toBe('http://localhost:7803');
  });
});
