import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('Hive browser state recovery route', () => {
  it('redirects to login and clears browser storage headers', async () => {
    const response = await GET(
      new NextRequest('https://hive.tuturuuu.com/~recover-browser-state', {
        headers: {
          cookie:
            'sb-resolved-kingfish-21146-auth-token=stale; sb-resolved-kingfish-21146-auth-token.0=chunk; unrelated=value',
        },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://hive.tuturuuu.com/login?browserStateReset=1'
    );
    expect(response.headers.get('cache-control')).toBe(
      'no-store, no-cache, must-revalidate'
    );
    expect(response.headers.get('clear-site-data')).toBe(
      '"cache", "cookies", "storage", "executionContexts"'
    );
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token')?.value
    ).toBe('');
    expect(
      response.cookies.get('sb-resolved-kingfish-21146-auth-token.0')?.value
    ).toBe('');
    expect(response.cookies.get('unrelated')).toBeUndefined();
  });

  it('does not redirect browser-state recovery to the internal listener origin', async () => {
    const response = await GET(
      new NextRequest('http://0.0.0.0:7814/~recover-browser-state')
    );

    expect(response.headers.get('location')).toBe(
      'http://localhost:7814/login?browserStateReset=1'
    );
  });
});
