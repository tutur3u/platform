import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}));

import { GET, POST } from './route';

const translations: Record<string, string> = {
  button: 'Reset <state>',
  description: 'Clear cached data & sign out.',
  forbidden: 'Same-origin confirmation required.',
  title: 'Reset "browser" state',
};

describe('Hive browser state recovery route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue(
      (key: string) => translations[key] ?? key
    );
  });

  it('serves a localized no-store confirmation page without clearing browser state on GET', async () => {
    const response = await GET(
      new NextRequest('https://hive.tuturuuu.com/~recover-browser-state', {
        headers: {
          cookie: 'NEXT_LOCALE=vi; sb-resolved-kingfish-21146-auth-token=stale',
        },
      })
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('clear-site-data')).toBeNull();
    expect(response.headers.get('location')).toBeNull();
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token')
    ).toBeUndefined();
    expect(body).toContain('<html lang="vi">');
    expect(body).toContain(
      '<form method="post" action="/~recover-browser-state">'
    );
    expect(body).toContain('Reset &quot;browser&quot; state');
    expect(body).toContain('Clear cached data &amp; sign out.');
    expect(body).toContain('Reset &lt;state&gt;');
    expect(mocks.getTranslations).toHaveBeenCalledWith({
      locale: 'vi',
      namespace: 'browserStateRecovery',
    });
  });

  it('falls back to the default locale for an unsupported cookie', async () => {
    await GET(
      new NextRequest('https://hive.tuturuuu.com/~recover-browser-state', {
        headers: { cookie: 'NEXT_LOCALE=fr' },
      })
    );

    expect(mocks.getTranslations).toHaveBeenCalledWith({
      locale: 'en',
      namespace: 'browserStateRecovery',
    });
  });

  it('clears Hive site data and only Supabase auth cookies after same-origin Origin confirmation', async () => {
    const response = await POST(
      new NextRequest('https://hive.tuturuuu.com/~recover-browser-state', {
        headers: {
          cookie:
            'sb-resolved-kingfish-21146-auth-token=stale; sb-resolved-kingfish-21146-auth-token.0=chunk; unrelated=value',
          origin: 'https://hive.tuturuuu.com',
        },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://hive.tuturuuu.com/login?browserStateReset=1'
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('clear-site-data')).toBe(
      '"cache", "storage", "executionContexts"'
    );
    expect(response.headers.get('clear-site-data')).not.toContain('cookies');
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token')?.value
    ).toBe('');
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token.0')?.value
    ).toBe('');
    expect(response.cookies.get('unrelated')).toBeUndefined();
  });

  it('accepts same-origin Referer fallback and preserves the Hive public redirect', async () => {
    const response = await POST(
      new NextRequest('http://0.0.0.0:7814/~recover-browser-state', {
        headers: {
          referer: 'http://0.0.0.0:7814/settings',
        },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://hive.tuturuuu.localhost/login?browserStateReset=1'
    );
    expect(response.headers.get('clear-site-data')).toBe(
      '"cache", "storage", "executionContexts"'
    );
  });

  it.each([
    ['cross-origin Origin', { origin: 'https://attacker.example' }],
    [
      'malformed Origin even with a same-origin Referer',
      { origin: 'not a url', referer: 'https://hive.tuturuuu.com/settings' },
    ],
    ['missing Origin and Referer', {}],
    ['malformed Referer fallback', { referer: 'not a url' }],
  ])('rejects %s without clearing browser state', async (_name, headers) => {
    const response = await POST(
      new NextRequest('https://hive.tuturuuu.com/~recover-browser-state', {
        headers: {
          cookie: 'sb-resolved-kingfish-21146-auth-token=stale',
          ...headers,
        },
      })
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('clear-site-data')).toBeNull();
    expect(response.headers.get('location')).toBeNull();
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token')
    ).toBeUndefined();
  });
});
