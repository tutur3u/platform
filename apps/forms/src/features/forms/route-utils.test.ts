import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClient = vi.fn();
const getSatelliteAppSessionUser = vi.fn();
// Named `...Mock` so the guard's actorless-`getWorkspace(x)` regex does not
// match these test doubles.
const getWorkspaceMock = vi.fn();
const verifyWorkspaceMembershipType = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: (...args: unknown[]) =>
    getSatelliteAppSessionUser(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: (...args: unknown[]) => getWorkspaceMock(...args),
  verifyWorkspaceMembershipType: (...args: unknown[]) =>
    verifyWorkspaceMembershipType(...args),
}));

import { getWorkspaceRouteContext, parseFormIdParam } from './route-utils';

describe('parseFormIdParam', () => {
  it('accepts seeded Postgres UUID values that are not RFC 4122 variants', () => {
    expect(
      parseFormIdParam('50000000-0000-0000-0000-000000000001', 'form ID')
    ).toBe('50000000-0000-0000-0000-000000000001');
  });

  it('accepts standard RFC 4122 UUID values', () => {
    expect(
      parseFormIdParam('a0bba3b1-8861-4f5f-b174-746f75949001', 'form ID')
    ).toBe('a0bba3b1-8861-4f5f-b174-746f75949001');
  });

  it('rejects malformed form IDs', () => {
    expect(() => parseFormIdParam('abc', 'form ID')).toThrow('Invalid form ID');
    expect(() => parseFormIdParam('123', 'form ID')).toThrow('Invalid form ID');
    expect(() =>
      parseFormIdParam('50000000-0000-0000-0000-00000000001', 'form ID')
    ).toThrow('Invalid form ID');
  });
});

describe('getWorkspaceRouteContext', () => {
  const wsId = 'a0bba3b1-8861-4f5f-b174-746f75949001';
  const request = new Request('https://forms.tuturuuu.com/api/v1/x');

  beforeEach(() => {
    vi.clearAllMocks();
    createAdminClient.mockResolvedValue({ rpc: vi.fn() });
  });

  it('returns an unauthenticated context when there is no app session', async () => {
    getSatelliteAppSessionUser.mockResolvedValue(null);

    const context = await getWorkspaceRouteContext(request, 'personal');

    expect(context.user).toBeNull();
    expect(context.canManageForms).toBe(false);
    expect(context.canViewAnalytics).toBe(false);
    expect(context.isMember).toBe(false);
    // The workspace must never be resolved without an actor: doing so falls
    // back to an anonymous cookie client on a satellite domain.
    expect(getWorkspaceMock).not.toHaveBeenCalled();
  });

  it('resolves the workspace with the app-session actor injected', async () => {
    const user = { id: 'user-1', email: 'someone@example.com' };
    getSatelliteAppSessionUser.mockResolvedValue(user);
    getWorkspaceMock.mockResolvedValue({ id: wsId, personal: true });
    verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: true })
      .mockResolvedValueOnce({ data: false });
    createAdminClient.mockResolvedValue({ rpc });

    const context = await getWorkspaceRouteContext(request, 'personal');

    expect(getSatelliteAppSessionUser).toHaveBeenCalledWith('forms');
    expect(getWorkspaceMock).toHaveBeenCalledWith('personal', {
      useAdmin: true,
      user,
    });
    expect(context.wsId).toBe(wsId);
    expect(context.isMember).toBe(true);
    expect(context.canManageForms).toBe(true);
    expect(context.canViewAnalytics).toBe(false);
  });

  it('rejects a workspace the actor cannot resolve', async () => {
    getSatelliteAppSessionUser.mockResolvedValue({ id: 'user-1' });
    getWorkspaceMock.mockResolvedValue(null);

    await expect(
      getWorkspaceRouteContext(request, 'missing-workspace')
    ).rejects.toThrow('Invalid workspace ID');
  });
});
