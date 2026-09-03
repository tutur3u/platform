import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  validateAiTempAuthRequest: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  WorkspaceAuthError: class WorkspaceAuthError extends Error {},
  WorkspaceNotFoundError: class WorkspaceNotFoundError extends Error {},
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: (
    ...args: Parameters<typeof mocks.validateAiTempAuthRequest>
  ) => mocks.validateAiTempAuthRequest(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
  WorkspaceAuthError: mocks.WorkspaceAuthError,
  WorkspaceNotFoundError: mocks.WorkspaceNotFoundError,
}));

import { authorizeAiWorkspace, resolveAiRouteAuth } from './route-auth.js';

const WORKSPACE_A = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_B = '22222222-2222-4222-8222-222222222222';

describe('resolveAiRouteAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'session-user-1' } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.validateAiTempAuthRequest.mockResolvedValue({ status: 'missing' });
    mocks.normalizeWorkspaceId.mockImplementation(async (wsId) => wsId);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      membershipType: 'MEMBER',
      ok: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses a valid AI temp token without calling Supabase getUser', async () => {
    mocks.validateAiTempAuthRequest.mockResolvedValue({
      status: 'valid',
      context: {
        user: { id: 'temp-user-1', email: 'temp@example.com' },
        wsId: 'workspace-1',
      },
    });

    const result = await resolveAiRouteAuth(
      new Request('http://localhost/api/ai/chat')
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user).toEqual(
        expect.objectContaining({ id: 'temp-user-1' })
      );
      expect(result.tempAuthContext?.wsId).toBe('workspace-1');
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('rejects a revoked AI temp token without falling back to getUser', async () => {
    mocks.validateAiTempAuthRequest.mockResolvedValue({ status: 'revoked' });

    const result = await resolveAiRouteAuth(
      new Request('http://localhost/api/ai/chat')
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it('falls back to Supabase auth when temp auth is missing', async () => {
    const result = await resolveAiRouteAuth(
      new Request('http://localhost/api/ai/chat')
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe('session-user-1');
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when both temp auth and Supabase session auth fail', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('missing session'),
    });

    const result = await resolveAiRouteAuth(
      new Request('http://localhost/api/ai/chat')
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it.each([WORKSPACE_A, WORKSPACE_B])(
    'authorizes and returns a normalized workspace for %s',
    async (wsId) => {
      const request = new Request('http://localhost/api/ai/chat');
      const supabase = { from: vi.fn() } as never;
      const membershipClient = { from: vi.fn() } as never;
      const normalizedWsId = wsId === WORKSPACE_A ? WORKSPACE_B : WORKSPACE_A;
      mocks.normalizeWorkspaceId.mockResolvedValueOnce(normalizedWsId);

      const result = await authorizeAiWorkspace({
        membershipClient,
        request,
        supabase,
        userId: 'user-1',
        wsId,
      });

      expect(result).toEqual({ ok: true, wsId: normalizedWsId });
      expect(mocks.normalizeWorkspaceId).toHaveBeenCalledWith(
        wsId,
        supabase,
        request
      );
      expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
        requiredType: 'MEMBER',
        supabase: membershipClient,
        userId: 'user-1',
        wsId: normalizedWsId,
      });
    }
  );

  it.each([
    [new mocks.WorkspaceAuthError('User not authenticated'), 401],
    [new mocks.WorkspaceNotFoundError('Personal workspace not found'), 404],
    [new Error('database unavailable'), 500],
  ])(
    'classifies workspace resolution failure %s as %i',
    async (error, status) => {
      mocks.normalizeWorkspaceId.mockRejectedValueOnce(error);
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      const result = await authorizeAiWorkspace({
        request: new Request('http://localhost/api/ai/chat'),
        supabase: {} as never,
        userId: 'user-1',
        wsId: 'personal',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.response.status).toBe(status);
      expect(consoleError).toHaveBeenCalled();
    }
  );

  it('returns 422 for a malformed normalized workspace without membership lookup', async () => {
    mocks.normalizeWorkspaceId.mockResolvedValue('not-a-workspace');

    const result = await authorizeAiWorkspace({
      request: new Request('http://localhost/api/ai/chat'),
      supabase: {} as never,
      userId: 'user-1',
      wsId: 'not-a-workspace',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(422);
    expect(mocks.verifyWorkspaceMembershipType).not.toHaveBeenCalled();
  });

  it('returns 403 for a workspace nonmember', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_missing',
      ok: false,
    });

    const result = await authorizeAiWorkspace({
      request: new Request('http://localhost/api/ai/chat'),
      supabase: {} as never,
      userId: 'user-1',
      wsId: WORKSPACE_A,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it('returns 500 when workspace membership lookup fails', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_lookup_failed',
      ok: false,
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const result = await authorizeAiWorkspace({
      request: new Request('http://localhost/api/ai/chat'),
      supabase: {} as never,
      userId: 'user-1',
      wsId: WORKSPACE_A,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledWith(
      'DB error checking workspace membership'
    );
  });
});
