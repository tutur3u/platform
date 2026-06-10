import { describe, expect, it, vi } from 'vitest';
import {
  getDuplicateSupabaseAuthCookieNames,
  getMalformedSupabaseAuthCookieNames,
  getNonCanonicalSupabaseAuthCookieNames,
  getSupabaseAuthCookieNames,
  sanitizeSupabaseAuthCookies,
} from '../auth-cookie-sanitizer';

const supabaseUrl = 'https://test.supabase.co';

function encodeSupabaseSession(payload = { access_token: 'jwt' }) {
  return `base64-${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

describe('auth-cookie-sanitizer', () => {
  it('deduplicates valid auth chunks and expires the duplicate host-only cookie', () => {
    const validChunk = encodeSupabaseSession();
    const clearCookie = vi.fn();
    const cookies = [
      { name: 'sb-test-auth-token.0', value: validChunk },
      { name: 'theme', value: 'dark' },
      { name: 'sb-test-auth-token.0', value: validChunk },
    ];

    expect(
      sanitizeSupabaseAuthCookies(cookies, supabaseUrl, clearCookie)
    ).toEqual([
      { name: 'theme', value: 'dark' },
      { name: 'sb-test-auth-token.0', value: validChunk },
    ]);
    expect(clearCookie).toHaveBeenCalledWith('sb-test-auth-token.0', {
      expires: expect.any(Date),
      maxAge: 0,
      path: '/',
    });
  });

  it('does not report duplicate valid chunks as malformed auth cookies', () => {
    const validChunk = encodeSupabaseSession();

    expect(
      getMalformedSupabaseAuthCookieNames(
        [
          { name: 'sb-test-auth-token.0', value: validChunk },
          { name: 'sb-test-auth-token.0', value: validChunk },
        ],
        supabaseUrl
      )
    ).toEqual([]);
  });

  it('detects duplicate Supabase auth names from the raw cookie header', () => {
    expect(
      getDuplicateSupabaseAuthCookieNames(
        [
          'theme=dark',
          'sb-test-auth-token.0=shared',
          'sb-test-auth-token.0=host',
          'sb-test-auth-token.1=shared',
          'sb-test-auth-token.1=host',
          'sb-other-auth-token.0=ignored',
        ].join('; '),
        supabaseUrl
      )
    ).toEqual(['sb-test-auth-token.0', 'sb-test-auth-token.1']);
  });

  it('detects duplicates for both server and public Supabase storage keys', () => {
    expect(
      getDuplicateSupabaseAuthCookieNames(
        [
          'sb-host-auth-token.0=shared',
          'sb-host-auth-token.0=host',
          'sb-127-auth-token.0=shared',
          'sb-127-auth-token.0=host',
          'sb-other-auth-token.0=ignored',
        ].join('; '),
        ['http://host.docker.internal:8001', 'http://127.0.0.1:8001']
      )
    ).toEqual(['sb-host-auth-token.0', 'sb-127-auth-token.0']);
  });

  it('ignores non-duplicate Supabase auth names from the raw cookie header', () => {
    expect(
      getDuplicateSupabaseAuthCookieNames(
        'sb-test-auth-token.0=shared; sb-test-auth-token.1=shared',
        supabaseUrl
      )
    ).toEqual([]);
  });

  it('detects possible Supabase auth names from a single raw cookie header entry', () => {
    expect(
      getSupabaseAuthCookieNames(
        [
          'theme=dark',
          'sb-test-auth-token=shared',
          'sb-test-auth-token.0=chunk',
          'sb-other-auth-token=ignored',
        ].join('; '),
        supabaseUrl
      )
    ).toEqual(['sb-test-auth-token', 'sb-test-auth-token.0']);
  });

  it('mirrors valid server-url auth cookies to the public canonical storage key', () => {
    const validSession = encodeSupabaseSession();
    const clearCookie = vi.fn();
    const mirrorCookie = vi.fn();

    expect(
      sanitizeSupabaseAuthCookies(
        [
          { name: 'theme', value: 'dark' },
          { name: 'sb-host-auth-token', value: validSession },
        ],
        ['http://127.0.0.1:8001', 'http://host.docker.internal:8001'],
        clearCookie,
        mirrorCookie
      )
    ).toEqual([
      { name: 'theme', value: 'dark' },
      { name: 'sb-127-auth-token', value: validSession },
    ]);
    expect(mirrorCookie).toHaveBeenCalledWith(
      'sb-127-auth-token',
      validSession
    );
    expect(clearCookie).toHaveBeenCalledWith('sb-host-auth-token', {
      expires: expect.any(Date),
      maxAge: 0,
      path: '/',
    });
  });

  it('keeps canonical auth cookies when both public and server keys are present', () => {
    const canonicalSession = encodeSupabaseSession({ access_token: 'public' });
    const serverSession = encodeSupabaseSession({ access_token: 'server' });
    const clearCookie = vi.fn();
    const mirrorCookie = vi.fn();

    expect(
      sanitizeSupabaseAuthCookies(
        [
          { name: 'sb-host-auth-token', value: serverSession },
          { name: 'sb-127-auth-token', value: canonicalSession },
        ],
        ['http://127.0.0.1:8001', 'http://host.docker.internal:8001'],
        clearCookie,
        mirrorCookie
      )
    ).toEqual([{ name: 'sb-127-auth-token', value: canonicalSession }]);
    expect(mirrorCookie).not.toHaveBeenCalled();
    expect(clearCookie).toHaveBeenCalledWith('sb-host-auth-token', {
      expires: expect.any(Date),
      maxAge: 0,
      path: '/',
    });
  });

  it('detects noncanonical auth cookie names from compatible storage keys', () => {
    expect(
      getNonCanonicalSupabaseAuthCookieNames(
        [
          'sb-127-auth-token=public',
          'sb-host-auth-token=server',
          'sb-host-auth-token.0=server-chunk',
          'sb-other-auth-token=ignored',
        ].join('; '),
        ['http://127.0.0.1:8001', 'http://host.docker.internal:8001']
      )
    ).toEqual(['sb-host-auth-token', 'sb-host-auth-token.0']);
  });
});
