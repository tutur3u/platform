import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getExternalAppByReturnUrl: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppByReturnUrl: (
    ...args: Parameters<typeof mocks.getExternalAppByReturnUrl>
  ) => mocks.getExternalAppByReturnUrl(...args),
}));

const EDUFEST_ORIGIN = 'https://showcase.ieeai.net';
const EDUFEST_RETURN_URL = `${EDUFEST_ORIGIN}/edufest/verify-token?for=player&state=opaque-state`;
// BASE64URL(SHA256(verifier)) is always 43 characters.
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

function callback(params: Record<string, string>) {
  const url = new URL('https://tuturuuu.com/api/auth/callback');
  url.searchParams.set('code', 'oauth-code');
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return GET(new NextRequest(url));
}

async function locationOf(params: Record<string, string>) {
  const response = await callback(params);
  return new URL(response.headers.get('location') ?? '');
}

describe('auth callback cross-app PKCE forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.com');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', '');
    mocks.createClient.mockResolvedValue({
      auth: { exchangeCodeForSession: vi.fn().mockResolvedValue(undefined) },
    });
    mocks.getExternalAppByReturnUrl.mockImplementation(
      async (returnUrl: string) =>
        new URL(returnUrl).origin === EDUFEST_ORIGIN
          ? { displayName: 'EduFest Booth Hall', id: 'edufest' }
          : null
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a registered external app to login with its returnUrl and S256 challenge', async () => {
    const location = await locationOf({
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      returnUrl: EDUFEST_RETURN_URL,
    });

    expect(location.origin).toBe('https://tuturuuu.com');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('returnUrl')).toBe(EDUFEST_RETURN_URL);
    expect(location.searchParams.get('code_challenge')).toBe(CHALLENGE);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('keeps the external returnUrl when the app sends no challenge', async () => {
    const location = await locationOf({ returnUrl: EDUFEST_RETURN_URL });

    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('returnUrl')).toBe(EDUFEST_RETURN_URL);
    expect(location.searchParams.has('code_challenge')).toBe(false);
  });

  it.each([
    [
      'a plain method',
      { code_challenge: CHALLENGE, code_challenge_method: 'plain' },
    ],
    ['a missing method', { code_challenge: CHALLENGE }],
    [
      'a malformed challenge',
      { code_challenge: 'short', code_challenge_method: 'S256' },
    ],
  ])('never forwards %s', async (_name, pkce) => {
    const location = await locationOf({
      ...pkce,
      returnUrl: EDUFEST_RETURN_URL,
    });

    expect(location.pathname).toBe('/login');
    expect(location.searchParams.has('code_challenge')).toBe(false);
    expect(location.searchParams.has('code_challenge_method')).toBe(false);
  });

  it('never forwards a verifier or a caller-chosen target app', async () => {
    const location = await locationOf({
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      code_verifier: 'v'.repeat(43),
      codeVerifier: 'v'.repeat(43),
      returnUrl: EDUFEST_RETURN_URL,
      targetApp: 'another-app',
    });

    expect(location.searchParams.has('code_verifier')).toBe(false);
    expect(location.searchParams.has('codeVerifier')).toBe(false);
    expect(location.searchParams.has('targetApp')).toBe(false);
    expect(location.searchParams.get('returnUrl')).toBe(EDUFEST_RETURN_URL);
  });

  it('fails closed for an unregistered return target and drops its challenge', async () => {
    const location = await locationOf({
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      returnUrl: 'https://showcase.ieeai.net.evil.test/edufest/verify-token',
    });

    expect(location.origin).toBe('https://tuturuuu.com');
    expect(location.pathname).toBe('/personal');
    expect(location.search).toBe('');
  });

  it('does not attach a challenge to a same-origin return', async () => {
    const location = await locationOf({
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
      returnUrl: '/personal/tasks',
    });

    expect(location.pathname).toBe('/personal/tasks');
    expect(location.searchParams.has('code_challenge')).toBe(false);
  });
});
