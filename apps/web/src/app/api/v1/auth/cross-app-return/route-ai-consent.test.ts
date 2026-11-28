import { readAiConsentBrowserOriginTransfer } from '@tuturuuu/utils/ai-consent-session';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: vi.fn(async () => ({ data: null, error: null })),
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
  getExternalAppByReturnUrl: vi.fn(async () => ({
    callbackPaths: [],
    displayName: 'Fysh',
    enabled: true,
    id: 'fysh',
    origins: ['https://fysh.example'],
    requirePkce: false,
  })),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  withRequestLogDrain: (_metadata: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

async function mintedSessionData(headers: Record<string, string>) {
  const response = await POST(
    new NextRequest('http://localhost/api/v1/auth/cross-app-return', {
      body: JSON.stringify({
        aiConsentTransfer: 'forged',
        returnUrl: 'https://fysh.example/auth/callback',
      }),
      headers,
      method: 'POST',
    })
  );
  expect(response.status).toBe(200);
  const [, args] = mocks.rpc.mock.calls[0] as [
    string,
    { p_session_data: Record<string, unknown> },
  ];
  return args.p_session_data;
}

describe('cross-app return browser origin for Mira AI consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', '');
    mocks.rpc.mockResolvedValue({ data: 'handoff-token', error: null });
  });

  it('vouches for a handoff minted from a cookie session', async () => {
    const sessionData = await mintedSessionData({
      cookie: 'sb-project-auth-token=base64-session',
    });
    expect(
      readAiConsentBrowserOriginTransfer(
        sessionData.aiConsentTransfer,
        'user-1',
        'fysh'
      )
    ).toBe(true);
  });

  it('never vouches for a handoff minted for a native bearer caller', async () => {
    const sessionData = await mintedSessionData({
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.native.jwt',
    });
    expect(sessionData).not.toHaveProperty('aiConsentTransfer');
  });
});
