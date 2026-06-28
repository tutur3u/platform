import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeInventoryWorkspace: vi.fn(),
  getInventorySquareSettings: vi.fn(),
  saveInventorySquareSettings: vi.fn(),
  serverError: vi.fn(),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
}));

vi.mock('@/lib/inventory/commerce/auth', () => ({
  authorizeInventoryWorkspace: (
    ...args: Parameters<typeof mocks.authorizeInventoryWorkspace>
  ) => mocks.authorizeInventoryWorkspace(...args),
}));

vi.mock('@/lib/inventory/commerce/square', () => ({
  getInventorySquareSettings: (
    ...args: Parameters<typeof mocks.getInventorySquareSettings>
  ) => mocks.getInventorySquareSettings(...args),
  saveInventorySquareSettings: (
    ...args: Parameters<typeof mocks.saveInventorySquareSettings>
  ) => mocks.saveInventorySquareSettings(...args),
}));

function params() {
  return {
    params: Promise.resolve({
      wsId: 'workspace-1',
    }),
  };
}

function request(method = 'GET', body?: unknown) {
  return new Request(
    'http://localhost/api/v1/workspaces/workspace-1/inventory/square-settings',
    {
      body: body === undefined ? undefined : JSON.stringify(body),
      method,
    }
  );
}

function withPermissions(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
  };
}

describe('inventory Square settings route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getInventorySquareSettings.mockResolvedValue({
      appCredentials: [
        {
          applicationId: 'square-app-id',
          applicationSecretFingerprint: 'app-secret-sha256',
          applicationSecretLast4: 'cdef',
          environment: 'sandbox',
          oauthRedirectUrl: null,
          updatedAt: '2026-06-28T00:00:00.000Z',
          webhookNotificationUrl: null,
        },
      ],
      connections: [
        {
          accessTokenFingerprint: 'token-sha256',
          accessTokenLast4: '1234',
          authMethod: 'oauth',
          environment: 'sandbox',
          status: 'ready',
          webhookSignatureKeyLast4: 'abcd',
        },
      ],
      environment: 'sandbox',
      readiness: { issues: [], ready: true },
      wsId: 'workspace-1',
    });
  });

  it('does not expose Square settings to dashboard-only viewers', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['view_inventory_dashboard']),
        userId: 'user-1',
        wsId: 'workspace-1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(request(), params());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(mocks.getInventorySquareSettings).not.toHaveBeenCalled();
  });

  it('returns masked Square settings to inventory setup managers', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['manage_inventory_setup']),
        userId: 'user-1',
        wsId: 'workspace-1',
      },
    });

    const { GET } = await import('./route');
    const response = await GET(request(), params());

    expect(response.status).toBe(200);
    expect(mocks.getInventorySquareSettings).toHaveBeenCalledWith(
      'workspace-1'
    );
    await expect(response.json()).resolves.toMatchObject({
      appCredentials: [
        {
          applicationId: 'square-app-id',
          applicationSecretLast4: 'cdef',
        },
      ],
      connections: [
        {
          accessTokenLast4: '1234',
          webhookSignatureKeyLast4: 'abcd',
        },
      ],
      readiness: { ready: true },
    });
  });

  it('passes validated manual-token payloads through with authorized user scope', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['manage_inventory_setup']),
        userId: 'user-1',
        wsId: 'workspace-1',
      },
    });
    mocks.saveInventorySquareSettings.mockResolvedValue({
      environment: 'sandbox',
      readiness: { issues: ['location_missing'], ready: false },
      wsId: 'workspace-1',
    });

    const { PUT } = await import('./route');
    const response = await PUT(
      request('PUT', {
        accessToken: 'square-token',
        environment: 'sandbox',
        webhookSignatureKey: 'square-webhook-key',
      }),
      params()
    );

    expect(response.status).toBe(200);
    expect(mocks.saveInventorySquareSettings).toHaveBeenCalledWith({
      payload: {
        accessToken: 'square-token',
        environment: 'sandbox',
        webhookSignatureKey: 'square-webhook-key',
      },
      userId: 'user-1',
      wsId: 'workspace-1',
    });
  });

  it('passes validated workspace app-credential payloads through with authorized user scope', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['manage_inventory_setup']),
        userId: 'user-1',
        wsId: 'workspace-1',
      },
    });
    mocks.saveInventorySquareSettings.mockResolvedValue({
      appCredentials: [
        {
          applicationId: 'square-app-id',
          applicationSecretLast4: 'cdef',
          environment: 'sandbox',
        },
      ],
      environment: 'sandbox',
      readiness: { issues: ['connection_missing'], ready: false },
      wsId: 'workspace-1',
    });

    const { PUT } = await import('./route');
    const response = await PUT(
      request('PUT', {
        applicationId: 'square-app-id',
        applicationSecret: 'square-app-secret',
        environment: 'sandbox',
        oauthRedirectUrl:
          'https://inventory.example.com/api/v1/inventory/square/oauth/callback',
        webhookNotificationUrl:
          'https://inventory.example.com/api/v1/inventory/square/webhook/workspace-1',
      }),
      params()
    );

    expect(response.status).toBe(200);
    expect(mocks.saveInventorySquareSettings).toHaveBeenCalledWith({
      payload: {
        applicationId: 'square-app-id',
        applicationSecret: 'square-app-secret',
        environment: 'sandbox',
        oauthRedirectUrl:
          'https://inventory.example.com/api/v1/inventory/square/oauth/callback',
        webhookNotificationUrl:
          'https://inventory.example.com/api/v1/inventory/square/webhook/workspace-1',
      },
      userId: 'user-1',
      wsId: 'workspace-1',
    });
  });

  it('rejects manual tokens without a matching environment', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['manage_inventory_setup']),
        userId: 'user-1',
        wsId: 'workspace-1',
      },
    });

    const { PUT } = await import('./route');
    const response = await PUT(
      request('PUT', { accessToken: 'square-token' }),
      params()
    );

    expect(response.status).toBe(400);
    expect(mocks.saveInventorySquareSettings).not.toHaveBeenCalled();
  });

  it('rejects app credentials without a matching environment', async () => {
    mocks.authorizeInventoryWorkspace.mockResolvedValue({
      ok: true,
      value: {
        permissions: withPermissions(['manage_inventory_setup']),
        userId: 'user-1',
        wsId: 'workspace-1',
      },
    });

    const { PUT } = await import('./route');
    const response = await PUT(
      request('PUT', { applicationId: 'square-app-id' }),
      params()
    );

    expect(response.status).toBe(400);
    expect(mocks.saveInventorySquareSettings).not.toHaveBeenCalled();
  });
});
