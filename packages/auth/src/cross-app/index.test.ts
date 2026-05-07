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

  it('maps the Learn production URL to the learn app', () => {
    expect(
      mapUrlToApp('https://learn.tuturuuu.com/verify-token?nextUrl=%2F')
    ).toBe('learn');
  });

  it('maps the Teach development URL to the teach app', () => {
    expect(mapUrlToApp('http://localhost:7813/verify-token?nextUrl=%2F')).toBe(
      'teach'
    );
  });

  it('rejects hostname prefix lookalikes', () => {
    expect(mapUrlToApp('https://learn.tuturuuu.com.evil.test')).toBeNull();
  });
});
