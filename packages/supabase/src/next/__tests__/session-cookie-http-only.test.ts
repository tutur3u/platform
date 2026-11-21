import { stringToBase64URL } from '@supabase/ssr';
import { ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAccountSwitchSession,
  createAccountSwitchAuth,
} from '../account-switch-auth';
import {
  getSupabaseCookieOptions,
  isSupabaseSessionCookieHttpOnly,
} from '../common';
import { createClient } from '../server';

const state = vi.hoisted(() => ({
  cookies: new Array<{ name: string; value: string }>(),
  response: new Headers(),
}));

// Serialize writes through Next's real ResponseCookies so the assertions see
// the exact Set-Cookie attributes a browser would receive.
vi.mock('next/headers', () => ({
  cookies: async () => {
    const jar = new ResponseCookies(state.response);
    return {
      getAll: () => state.cookies,
      set: (name: string, value: string, options?: Record<string, unknown>) =>
        jar.set({ ...options, name, value }),
    };
  },
}));

const SUPABASE_URL = 'https://test.supabase.co';
const user = {
  id: 'account-b',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'synthetic@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

function jwt(exp: number) {
  return `${stringToBase64URL(JSON.stringify({ alg: 'HS256' }))}.${stringToBase64URL(JSON.stringify({ sub: user.id, exp }))}.c3ludGhldGlj`;
}

function sessionCookieValue() {
  return `base64-${stringToBase64URL(
    JSON.stringify({
      access_token: jwt(Math.floor(Date.now() / 1000) + 3600),
      refresh_token: 'synthetic-refresh',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user,
    })
  )}`;
}

function supabaseSetCookies(headers: Headers) {
  return headers.getSetCookie().filter((header) => header.startsWith('sb-'));
}

/**
 * The cookie names page script can see through `document.cookie`: a browser
 * exposes a stored cookie to script only when it was set without `HttpOnly`.
 */
function scriptVisibleCookieNames(setCookieHeaders: string[]) {
  return setCookieHeaders
    .filter((header) => !/;\s*httponly\s*(;|$)/iu.test(header))
    .filter((header) => !/;\s*max-age=0\s*(;|$)/iu.test(header))
    .map((header) => header.slice(0, header.indexOf('=')));
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key');
  state.cookies = [{ name: 'sb-test-auth-token', value: sessionCookieValue() }];
  state.response = new Headers();
});

afterEach(() => vi.unstubAllEnvs());

describe('getSupabaseCookieOptions httpOnly', () => {
  it('leaves httpOnly unset while the flag is off', () => {
    expect(isSupabaseSessionCookieHttpOnly()).toBe(false);
    expect(
      getSupabaseCookieOptions(SUPABASE_URL, 'https://tasks.tuturuuu.com')
    ).not.toHaveProperty('httpOnly');
  });

  it('sets httpOnly on the server when the flag is on', () => {
    vi.stubEnv('TUTURUUU_SESSION_COOKIE_HTTP_ONLY', '1');
    expect(
      getSupabaseCookieOptions(SUPABASE_URL, 'https://tasks.tuturuuu.com')
    ).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });

  it('never sets httpOnly in a browser runtime', () => {
    vi.stubEnv('TUTURUUU_SESSION_COOKIE_HTTP_ONLY', '1');
    vi.stubGlobal('window', { location: { href: 'https://tuturuuu.com/' } });
    try {
      expect(isSupabaseSessionCookieHttpOnly()).toBe(false);
      expect(getSupabaseCookieOptions(SUPABASE_URL)).not.toHaveProperty(
        'httpOnly'
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('server session writes through @supabase/ssr', () => {
  async function commitSession() {
    const auth = await createAccountSwitchAuth(
      new Request('https://tuturuuu.com'),
      vi.fn<typeof fetch>(async (input) => {
        const target = new URL(String(input));
        if (target.pathname.endsWith('/user')) return Response.json(user);
        throw new Error('Unexpected provider endpoint');
      })
    );
    await auth.commit({
      access_token: jwt(Math.floor(Date.now() / 1000) + 3600),
      refresh_token: 'synthetic-new-refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user,
    } as never);
  }

  it('writes HttpOnly session chunks when the flag is on', async () => {
    vi.stubEnv('TUTURUUU_SESSION_COOKIE_HTTP_ONLY', 'true');
    await commitSession();

    const headers = supabaseSetCookies(state.response);
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) {
      expect(header).toMatch(/; HttpOnly(;|$)/u);
      expect(header).toMatch(/; SameSite=lax(;|$)/iu);
    }
    expect(scriptVisibleCookieNames(headers)).toEqual([]);
  });

  it('keeps the current readable cookie while the flag is off', async () => {
    await commitSession();

    const headers = supabaseSetCookies(state.response);
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) expect(header).not.toMatch(/HttpOnly/iu);
  });

  it('clears session chunks with HttpOnly when the flag is on', async () => {
    vi.stubEnv('TUTURUUU_SESSION_COOKIE_HTTP_ONLY', '1');
    await clearAccountSwitchSession(new Request('https://tuturuuu.com'));

    const headers = supabaseSetCookies(state.response);
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) expect(header).toMatch(/; HttpOnly(;|$)/u);
  });
});

describe('next/server cookie mirror', () => {
  async function readSessionThroughMirror() {
    // The server reads the private Supabase URL, whose storage key differs from
    // the canonical public key, so the sanitizer mirrors the cookie across.
    vi.stubEnv('SUPABASE_SERVER_URL', 'https://other.supabase.co');
    state.cookies = [
      { name: 'sb-other-auth-token', value: sessionCookieValue() },
    ];
    const supabase = await createClient();
    await supabase.auth.getSession();
    return state.response.getSetCookie();
  }

  it('mirrors and clears with HttpOnly when the flag is on', async () => {
    vi.stubEnv('TUTURUUU_SESSION_COOKIE_HTTP_ONLY', '1');
    const headers = await readSessionThroughMirror();

    const mirrored = headers.find((h) => h.startsWith('sb-test-auth-token='));
    const cleared = headers.find((h) => h.startsWith('sb-other-auth-token='));
    expect(mirrored).toMatch(/; HttpOnly(;|$)/u);
    expect(cleared).toMatch(/; HttpOnly(;|$)/u);
    expect(scriptVisibleCookieNames(headers)).toEqual([]);
  });

  it('mirrors without HttpOnly while the flag is off', async () => {
    const headers = await readSessionThroughMirror();

    expect(headers.some((h) => h.startsWith('sb-test-auth-token='))).toBe(true);
    for (const header of headers) expect(header).not.toMatch(/HttpOnly/iu);
  });
});
