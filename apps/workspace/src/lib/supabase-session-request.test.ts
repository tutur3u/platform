import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasSupportedSupabaseAuthCookie: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  APP_SESSION_COOKIE_NAME: 'tuturuuu_app_session',
  hasSupportedSupabaseAuthCookie: mocks.hasSupportedSupabaseAuthCookie,
}));

import { supabaseSessionRequest } from './supabase-session-request';

function request(headers: Record<string, string>) {
  return new NextRequest('https://workspace.tuturuuu.com/api/v1/example', {
    headers,
    method: 'PATCH',
  });
}

describe('supabaseSessionRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(true);
  });

  it('returns the same request unless the route prefers the Supabase session', () => {
    const original = request({
      authorization: 'Bearer ttr_app_token',
      cookie: 'tuturuuu_app_session=a; sb-project-auth-token=b',
    });

    expect(supabaseSessionRequest(original)).toBe(original);
    expect(supabaseSessionRequest(original, {})).toBe(original);
    expect(
      supabaseSessionRequest(original, { preferSupabaseSessionAuth: false })
    ).toBe(original);
  });

  it('returns the same request when no Supabase auth cookie is present', () => {
    mocks.hasSupportedSupabaseAuthCookie.mockReturnValue(false);
    const original = request({ authorization: 'Bearer ttr_app_token' });

    expect(
      supabaseSessionRequest(original, { preferSupabaseSessionAuth: true })
    ).toBe(original);
  });

  it('drops only the app-session markers from the copy', () => {
    const original = request({
      authorization: 'Bearer ttr_app_token',
      cookie: 'tuturuuu_app_session=a; sb-project-auth-token=b; theme=dark',
    });

    const copy = supabaseSessionRequest(original, {
      preferSupabaseSessionAuth: true,
    });

    expect(copy).not.toBe(original);
    expect(copy.headers.get('authorization')).toBeNull();
    expect(copy.headers.get('cookie')).toBe(
      'sb-project-auth-token=b; theme=dark'
    );
    expect(copy.method).toBe('PATCH');
    expect(copy.url).toBe(original.url);
    // The original request keeps its app-session markers.
    expect(original.headers.get('authorization')).toBe('Bearer ttr_app_token');
    expect(original.headers.get('cookie')).toContain('tuturuuu_app_session=a');
  });

  it('keeps a non app-session bearer and removes an emptied cookie header', () => {
    const copy = supabaseSessionRequest(
      request({
        authorization: 'Bearer other-token',
        cookie: 'tuturuuu_app_session=a',
      }),
      { preferSupabaseSessionAuth: true }
    );

    expect(copy.headers.get('authorization')).toBe('Bearer other-token');
    expect(copy.headers.get('cookie')).toBeNull();
  });
});
