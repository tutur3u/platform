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

describe('cross-app return expected account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', '');
    mocks.rpc.mockResolvedValue({ data: 'handoff-token', error: null });
    registerApp({ id: 'edufest' });
  });

  it('mints for the account the user confirmed', async () => {
    const response = await post({
      expectedUserId: 'user-1',
      returnUrl: callbackUrl,
    });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it('refuses to mint when the session switched to another account', async () => {
    const response = await post({
      expectedUserId: 'user-2',
      returnUrl: callbackUrl,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'ACCOUNT_CHANGED',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
