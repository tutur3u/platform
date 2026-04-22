import { beforeAll, describe, expect, it } from 'vitest';

let mapUrlToApp: typeof import('./index').mapUrlToApp;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://localhost:54321';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test-publishable-key';

  ({ mapUrlToApp } = await import('./index.js'));
});

describe('mapUrlToApp', () => {
  it('maps the CMS production URL to the cms app', () => {
    expect(
      mapUrlToApp('https://cms.tuturuuu.com/verify-token?nextUrl=%2F')
    ).toBe('cms');
  });

  it('maps the CMS development URL to the cms app', () => {
    expect(mapUrlToApp('http://localhost:7811/verify-token?nextUrl=%2F')).toBe(
      'cms'
    );
  });
});
