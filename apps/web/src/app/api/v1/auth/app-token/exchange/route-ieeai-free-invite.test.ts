import './route-test-support';
import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import {
  createAdminClientMock,
  createExchangeRequest,
  mockRegisteredApp,
  mocks,
  registerExchangeTestSetup,
} from './route-test-support';

const boundary = vi.hoisted(() => ({ authorize: vi.fn(), mfa: vi.fn() }));
vi.mock('@/lib/app-coordination/workspace-session', () => ({
  authorizeWorkspaceSessionAppTokenExchange: boundary.authorize,
}));
vi.mock('@tuturuuu/utils/required-mfa-app-session', () => ({
  isRequiredMfaProofAllowed: boundary.mfa,
}));
const ws = 'a65cebd7-3a8c-4883-a3d9-82f9703d652f';
const pending = {
  ok: false,
  status: 403,
  code: 'PENDING_WORKSPACE_INVITE',
  error: 'Pending workspace invitation',
  normalizedWorkspaceId: ws,
  invitation: {
    createdAt: '2026-01-01T00:00:00Z',
    matchedEmail: null,
    roleId: null,
    source: 'direct',
    type: 'MEMBER',
    workspace: { id: ws, handle: null, name: 'Synthetic', personal: false },
  },
};

describe('free IEEAI exchange integration', () => {
  registerExchangeTestSetup();
  const rpc = vi.fn();
  beforeEach(() => {
    mockRegisteredApp([], 'ieeai-stats', [ws]);
    boundary.mfa.mockResolvedValue(true);
    boundary.authorize.mockReset().mockResolvedValue(pending);
    rpc.mockReset().mockResolvedValue({ data: true, error: null });
    mocks.createAdminClient.mockResolvedValue({
      ...createAdminClientMock(),
      schema: () => ({ rpc }),
    });
  });
  const request = (extra: Record<string, unknown> = {}) =>
    POST(
      createExchangeRequest({
        appId: 'ieeai-stats',
        appSecret: 'ttr_app_secret_test',
        token: 'valid-cross-app-token',
        workspaceId: ws,
        requestedScopes: ['workspace:session'],
        ...extra,
      })
    );

  it('rechecks ordinary session authorization after atomic acceptance', async () => {
    boundary.authorize
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce({ ok: true, normalizedWorkspaceId: ws });
    const result = await request();
    expect(result.status).toBe(200);
    expect(rpc).toHaveBeenCalledOnce();
    expect(boundary.authorize).toHaveBeenCalledTimes(2);
    expect(await result.json()).toMatchObject({
      workspaceId: ws,
      scopes: ['workspace:session'],
    });
  });

  it('preserves existing member success without a new invite or entitlement lookup', async () => {
    boundary.authorize.mockResolvedValue({
      ok: true,
      normalizedWorkspaceId: ws,
    });
    expect((await request()).status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('recovers a membership race through the idempotent RPC and ordinary recheck', async () => {
    boundary.authorize
      .mockResolvedValueOnce({ ok: false, status: 403, error: 'Forbidden' })
      .mockResolvedValueOnce({ ok: true, normalizedWorkspaceId: ws });
    expect((await request()).status).toBe(200);
    expect(rpc).toHaveBeenCalledOnce();
    expect(boundary.authorize).toHaveBeenCalledTimes(2);
  });

  it('does not mutate after membership lookup failure', async () => {
    boundary.authorize.mockResolvedValue({
      ok: false,
      status: 500,
      error: 'Failed to verify workspace membership',
    });
    expect((await request()).status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([false, null])(
    'keeps paid/unknown refusal pending (%s)',
    async (data) => {
      rpc.mockResolvedValue({ data, error: null });
      const result = await request();
      expect(result.status).toBe(403);
      expect(await result.json()).toMatchObject({
        code: 'PENDING_WORKSPACE_INVITE',
      });
    }
  );

  it('does not expose private lookup diagnostics', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'synthetic internal diagnostic' },
    });
    const result = await request();
    expect(result.status).toBe(403);
    expect(await result.text()).not.toContain('synthetic internal diagnostic');
  });

  it('leaves a guest invitation untouched', async () => {
    boundary.authorize.mockResolvedValue({
      ...pending,
      invitation: { ...pending.invitation, type: 'GUEST' },
    });
    expect((await request()).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not accept during refresh', async () => {
    const refresh = createAppCoordinationToken({
      userId: '11111111-1111-4111-8111-111111111111',
      targetApp: 'ieeai-stats',
      originApp: 'web',
      scopes: ['app-token:refresh'],
    });
    expect(
      (await request({ token: undefined, refreshToken: refresh.token })).status
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('preserves MFA refusal before all invitation mutation', async () => {
    boundary.mfa.mockResolvedValue(false);
    const result = await request();
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ code: 'MFA_REQUIRED' });
    expect(rpc).not.toHaveBeenCalled();
    expect(boundary.authorize).not.toHaveBeenCalled();
  });

  it('refuses acceptance for an unconfirmed Auth account', async () => {
    mocks.createAdminClient.mockResolvedValue({
      ...createAdminClientMock({ authEmailConfirmed: false }),
      schema: () => ({ rpc }),
    });
    expect((await request()).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
