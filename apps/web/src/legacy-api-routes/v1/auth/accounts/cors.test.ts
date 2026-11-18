import { NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withAccountCors } from './cors';

function corsFor(origin: string) {
  const request = new Request('https://tuturuuu.com/api/v1/auth/accounts', {
    headers: { origin },
  });
  return withAccountCors(request, NextResponse.json({ ok: true })).headers;
}

describe('accounts API CORS', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'));
  afterEach(() => vi.unstubAllEnvs());

  it('admits registered Tuturuuu origins with credentials', () => {
    const headers = corsFor('https://tasks.tuturuuu.com');
    expect(headers.get('access-control-allow-origin')).toBe(
      'https://tasks.tuturuuu.com'
    );
    expect(headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('omits credentialed CORS for origins outside the exact registry', () => {
    for (const origin of [
      'https://origin.tuturuuu.com',
      'https://unregistered.tuturuuu.com',
      'https://a.b.tuturuuu.com',
      'https://tasks.tuturuuu.com:8443',
      'https://tuturuuu.com.evil.test',
      'http://tasks.tuturuuu.com',
      'http://localhost:7809',
    ]) {
      const headers = corsFor(origin);
      expect(headers.get('access-control-allow-origin')).toBeNull();
      expect(headers.get('access-control-allow-credentials')).toBeNull();
    }
  });

  it('uses the staging app registry only on the isolated staging deployment', () => {
    const origin = 'https://tasks.tutur3u.com';
    expect(corsFor(origin).get('access-control-allow-origin')).toBeNull();

    vi.stubEnv('TUTURUUU_DEPLOY_ENV', 'staging');
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN',
      '.staging.tutur3u.com'
    );

    expect(corsFor(origin).get('access-control-allow-origin')).toBe(origin);
    expect(
      corsFor('https://unregistered.tutur3u.com').get(
        'access-control-allow-origin'
      )
    ).toBeNull();
    expect(
      corsFor('https://tasks.tuturuuu.com').get('access-control-allow-origin')
    ).toBeNull();
  });

  it('allows only the configured local Portless origin in production mode', () => {
    const origin = 'https://tuturuuu.localhost:1355';
    vi.stubEnv('PORTLESS_URL', origin);

    expect(corsFor(origin).get('access-control-allow-origin')).toBe(origin);
    expect(
      corsFor('https://tasks.tuturuuu.localhost:1355').get(
        'access-control-allow-origin'
      )
    ).toBeNull();
  });
});
