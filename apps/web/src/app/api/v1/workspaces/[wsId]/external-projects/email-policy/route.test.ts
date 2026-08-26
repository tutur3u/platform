import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  resolveWorkspaceExternalProjectBinding: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown, params: unknown) => Response) =>
    async (request: Request, routeContext?: { params?: Promise<unknown> }) =>
      handler(
        request,
        { supabase: {}, user: { id: 'user-1' } },
        await routeContext?.params
      ),
}));

vi.mock('@/lib/external-projects/access', () => ({
  resolveWorkspaceExternalProjectBinding: (
    ...args: Parameters<typeof mocks.resolveWorkspaceExternalProjectBinding>
  ) => mocks.resolveWorkspaceExternalProjectBinding(...args),
}));

const WS = 'e7ff0d3f-5260-420c-989f-58ffa9843724';
const params = { params: Promise.resolve({ wsId: WS }) };
const currentSettings = {
  cmsSite: { template: { version: 1 } },
  outboundEmail: {
    allowedRecipientDomains: ['tuturuuu.com'],
    enabled: true,
    useRootWorkspaceCredentials: false,
  },
};

function permissionResult(permissions: string[]) {
  return {
    containsPermission: (permission: string) =>
      permissions.includes(permission),
    wsId: WS,
  };
}

function put(body: unknown) {
  return new Request('https://tuturuuu.com/email-policy', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPermissions.mockImplementation(({ wsId }: { wsId: string }) =>
    Promise.resolve(
      wsId === WS
        ? permissionResult(['manage_workspace_security'])
        : permissionResult([])
    )
  );
  mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
    enabled: true,
    settings: currentSettings,
  });
  mocks.update.mockResolvedValue({ error: null });
  mocks.createAdminClient.mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { settings: currentSettings },
            error: null,
          }),
        }),
      }),
      update: (value: unknown) => {
        mocks.update(value);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  });
});

describe('external project email policy route', () => {
  it('returns a default-deny-aware policy and credential capability', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://tuturuuu.com') as never,
      params
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      canUseRootCredentials: false,
      policy: currentSettings.outboundEmail,
    });
  });

  it('lets workspace security managers edit domains without losing settings', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(
      put({
        allowedRecipientDomains: ['richfieldgroup.com.vn'],
        enabled: true,
        useRootWorkspaceCredentials: false,
      }) as never,
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          cmsSite: currentSettings.cmsSite,
          outboundEmail: {
            allowedRecipientDomains: ['richfieldgroup.com.vn'],
            enabled: true,
            useRootWorkspaceCredentials: false,
          },
        }),
        updated_by: 'user-1',
      })
    );
  });

  it('blocks shared credential changes by non-platform admins', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(
      put({
        allowedRecipientDomains: ['tuturuuu.com'],
        enabled: true,
        useRootWorkspaceCredentials: true,
      }) as never,
      params
    );

    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('allows a platform external-project admin to grant shared credentials', async () => {
    mocks.getPermissions.mockImplementation(({ wsId }: { wsId: string }) =>
      Promise.resolve(
        wsId === WS
          ? permissionResult(['manage_workspace_security'])
          : permissionResult(['manage_external_projects'])
      )
    );
    const { PUT } = await import('./route');
    const response = await PUT(
      put({
        allowedRecipientDomains: ['tuturuuu.com'],
        enabled: true,
        useRootWorkspaceCredentials: true,
      }) as never,
      params
    );

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalled();
  });

  it('rejects wildcard domains', async () => {
    const { PUT } = await import('./route');
    const response = await PUT(
      put({
        allowedRecipientDomains: ['*.example.com'],
        enabled: true,
        useRootWorkspaceCredentials: false,
      }) as never,
      params
    );

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
