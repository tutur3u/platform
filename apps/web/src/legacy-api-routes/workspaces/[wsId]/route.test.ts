import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createPolarClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyHasSecrets: vi.fn(),
  withSessionAuth: vi.fn(
    (
      handler: (
        request: NextRequest,
        context: { supabase: { from: ReturnType<typeof vi.fn> } },
        params: { wsId: string }
      ) => unknown,
      options?: { allowAppSessionAuth?: unknown }
    ) => {
      (
        handler as unknown as { __withSessionAuthOptions?: unknown }
      ).__withSessionAuthOptions = options;
      return async (
        request: NextRequest,
        routeContext?: { params?: Promise<{ wsId: string }> }
      ) =>
        handler(
          request,
          { supabase: { from: mocks.from } },
          routeContext?.params ? await routeContext.params : { wsId: 'team-ws' }
        );
    }
  ),
  from: vi.fn(),
  deleteWorkspace: vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ error: null })),
  })),
}));

vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: mocks.createPolarClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyHasSecrets: (...args: Parameters<typeof mocks.verifyHasSecrets>) =>
    mocks.verifyHasSecrets(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

const WORKSPACE_ID = '00000000-0000-0000-0000-000000000011';

function createDeleteRequest() {
  return new NextRequest(`http://localhost/api/workspaces/${WORKSPACE_ID}`, {
    method: 'DELETE',
  });
}

function mockWorkspaceLookup(personal = false) {
  mocks.from.mockImplementation((table: string) => {
    if (table === 'workspaces') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { personal },
                error: null,
              })
            ),
          })),
        })),
        delete: mocks.deleteWorkspace,
      };
    }

    if (table === 'workspace_subscriptions') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            neq: vi.fn(() => ({
              maybeSingle: vi.fn(() =>
                Promise.resolve({ data: null, error: null })
              ),
            })),
          })),
        })),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe('legacy workspace detail route DELETE', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue(WORKSPACE_ID);
    mocks.verifyHasSecrets.mockResolvedValue(false);
    mocks.createPolarClient.mockReturnValue({
      subscriptions: { revoke: vi.fn() },
    });
  });

  it('opts GET, PUT, and DELETE into app-session auth', async () => {
    await import('./route');

    expect(mocks.withSessionAuth).toHaveBeenCalledTimes(3);
    expect(
      mocks.withSessionAuth.mock.calls.every(
        ([, options]) => options?.allowAppSessionAuth !== undefined
      )
    ).toBe(true);
  });

  it('denies deletion without manage_workspace_settings', async () => {
    mockWorkspaceLookup(false);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });

    const route = await import('./route');
    const response = await route.DELETE(createDeleteRequest(), {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions to delete workspace',
    });
    expect(mocks.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('denies deletion when PREVENT_WORKSPACE_DELETION is enabled', async () => {
    mockWorkspaceLookup(false);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_workspace_settings',
    });
    mocks.verifyHasSecrets.mockResolvedValue(true);

    const route = await import('./route');
    const response = await route.DELETE(createDeleteRequest(), {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Workspace deletion is disabled for this workspace.',
    });
    expect(mocks.verifyHasSecrets).toHaveBeenCalledWith(WORKSPACE_ID, [
      'PREVENT_WORKSPACE_DELETION',
    ]);
    expect(mocks.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('deletes the workspace when permission and secret checks pass', async () => {
    mockWorkspaceLookup(false);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'manage_workspace_settings',
    });

    const route = await import('./route');
    const response = await route.DELETE(createDeleteRequest(), {
      params: Promise.resolve({ wsId: WORKSPACE_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      wsId: WORKSPACE_ID,
      request: expect.any(NextRequest),
    });
    expect(mocks.deleteWorkspace).toHaveBeenCalled();
  });
});
