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

  it('admits https Tuturuuu origins one label deep, with credentials', () => {
    const headers = corsFor('https://tasks.tuturuuu.com');
    expect(headers.get('access-control-allow-origin')).toBe(
      'https://tasks.tuturuuu.com'
    );
    expect(headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('no longer echoes any *.tuturuuu.com origin', () => {
    for (const origin of [
      'https://origin.tuturuuu.com',
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
});
