import { readSessionAssuranceTransfer } from '@tuturuuu/utils/session-assurance-transfer';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: mocks.getClaims,
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

async function mintedSessionData(
  claims: Record<string, unknown> | null,
  error: unknown = null
) {
  mocks.getClaims.mockResolvedValue({ data: claims && { claims }, error });
  const response = await POST(
    new NextRequest('http://localhost/api/v1/auth/cross-app-return', {
      body: JSON.stringify({
        // Client-supplied assurance must be ignored.
        aal: 'aal2',
        assuranceTransfer: 'forged',
        returnUrl: 'https://fysh.example/auth/callback',
      }),
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

describe('cross-app return session assurance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', '');
    mocks.rpc.mockResolvedValue({ data: 'handoff-token', error: null });
  });

  it('records an aal2 session from its verified claims', async () => {
    const sessionData = await mintedSessionData({
      aal: 'aal2',
      amr: [
        { method: 'password', timestamp: 1 },
        { method: 'totp', timestamp: 2 },
      ],
      session_id: 'session-1',
      sub: 'user-1',
    });
    expect(
      readSessionAssuranceTransfer(
        sessionData.assuranceTransfer,
        'user-1',
        'fysh'
      )
    ).toEqual({ aal: 'aal2', amr: ['password', 'totp'] });
    expect(sessionData).not.toHaveProperty('aal');
  });

  it('records an aal1 session', async () => {
    const sessionData = await mintedSessionData({
      aal: 'aal1',
      amr: [{ method: 'password', timestamp: 1 }],
      sub: 'user-1',
    });
    expect(
      readSessionAssuranceTransfer(
        sessionData.assuranceTransfer,
        'user-1',
        'fysh'
      )
    ).toEqual({ aal: 'aal1', amr: ['password'] });
  });

  it.each([
    ['claims without aal', { sub: 'user-1' }, null],
    ['claims for another subject', { aal: 'aal2', sub: 'user-2' }, null],
    ['unverifiable claims', { aal: 'aal2', sub: 'user-1' }, new Error('bad')],
  ])('omits assurance for %s', async (_label, claims, error) => {
    const sessionData = await mintedSessionData(claims, error);
    expect(sessionData).not.toHaveProperty('assuranceTransfer');
  });
});
