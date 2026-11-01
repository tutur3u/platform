import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  getExternalAppByReturnUrl: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: vi.fn(async () => ({ data: { claims: {} }, error: null })),
      getUser: vi.fn(async () => ({
        data: { user: { email: 'user@example.com', id: 'user-1' } },
        error: null,
      })),
    },
    rpc: mocks.rpc,
  })),
}));

vi.mock('@tuturuuu/utils/required-mfa-request', () => ({
  checkRequiredAccountMfa: vi.fn(async () => ({
    proof: null,
    status: 'allowed',
    userId: 'user-1',
  })),
}));

vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppByReturnUrl: (...args: unknown[]) =>
    mocks.getExternalAppByReturnUrl(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  withRequestLogDrain: (_metadata: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const callbackUrl = 'https://fysh.example/auth/callback?state=s1';

function registerApp({
  callbackPaths = [] as string[],
  id = 'fysh',
  requirePkce = false,
} = {}) {
  mocks.getExternalAppByReturnUrl.mockResolvedValue({
    callbackPaths,
    displayName: id,
    enabled: true,
    id,
    origins: ['https://fysh.example'],
    requirePkce,
  });
}

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost/api/v1/auth/cross-app-return', {
      body: JSON.stringify(body),
      method: 'POST',
    })
  );
}

describe('cross-app return PKCE binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', '');
    mocks.rpc.mockResolvedValue({ data: 'handoff-token', error: null });
  });

  it('keeps legacy registry apps unchanged without a challenge', async () => {
    registerApp({ id: 'yashie' });
    const response = await post({ returnUrl: callbackUrl });

    expect(response.status).toBe(200);
    const args = mocks.rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(mocks.rpc).toHaveBeenCalledWith(
      'generate_cross_app_token',
      expect.objectContaining({ p_target_app: 'yashie' })
    );
    expect(args).not.toHaveProperty('p_code_challenge');
  });

  it('binds an optional challenge for a legacy app', async () => {
    registerApp();
    const response = await post({
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      returnUrl: callbackUrl,
    });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'generate_cross_app_token',
      expect.objectContaining({
        p_code_challenge: challenge,
        p_code_challenge_method: 'S256',
        p_target_app: 'fysh',
      })
    );
  });

  it('refuses to mint for a PKCE app without a challenge', async () => {
    registerApp({ requirePkce: true });
    const response = await post({ returnUrl: callbackUrl });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'PKCE_REQUIRED',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [
      'plain method',
      { codeChallenge: challenge, codeChallengeMethod: 'plain' },
    ],
    ['missing method', { codeChallenge: challenge }],
    ['short challenge', { codeChallenge: 'abc', codeChallengeMethod: 'S256' }],
    [
      'non-base64url challenge',
      {
        codeChallenge: `${challenge.slice(0, 42)}+`,
        codeChallengeMethod: 'S256',
      },
    ],
  ])('rejects a %s', async (_label, pkce) => {
    registerApp({ requirePkce: true });
    const response = await post({ ...pkce, returnUrl: callbackUrl });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'INVALID_CODE_CHALLENGE',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('mints a challenge-bound token for a PKCE app', async () => {
    registerApp({ callbackPaths: ['/auth/callback'], requirePkce: true });
    const response = await post({
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      returnUrl: callbackUrl,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { returnUrl: string };
    const returnUrl = new URL(body.returnUrl);
    expect(returnUrl.pathname).toBe('/auth/callback');
    expect(returnUrl.searchParams.get('token')).toBe('handoff-token');
    expect(returnUrl.searchParams.get('state')).toBe('s1');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'generate_cross_app_token',
      expect.objectContaining({ p_code_challenge: challenge })
    );
  });

  it('pins return URLs to registered callback paths', async () => {
    registerApp({ callbackPaths: ['/auth/callback'], requirePkce: true });

    for (const generateToken of [false, true]) {
      const response = await post({
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        generateToken,
        returnUrl: 'https://fysh.example/open-redirect?next=evil',
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: 'Invalid returnUrl',
      });
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not bind challenges to internal app verifiers', async () => {
    const response = await post({
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      returnUrl: 'https://tasks.tuturuuu.localhost/login',
    });

    expect(response.status).toBe(200);
    const args = mocks.rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args).toMatchObject({ p_target_app: 'tasks' });
    expect(args).not.toHaveProperty('p_code_challenge');
    expect(mocks.getExternalAppByReturnUrl).not.toHaveBeenCalled();
  });
});
