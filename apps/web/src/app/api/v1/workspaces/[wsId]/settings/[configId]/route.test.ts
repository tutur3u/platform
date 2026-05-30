import { ENABLE_CMS_GAMES_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
  serverLogger: {
    error: vi.fn(),
  },
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/finance-route-auth', () => ({
  resolveFinanceRouteAuthContext: (
    ...args: Parameters<typeof mocks.resolveFinanceRouteAuthContext>
  ) => mocks.resolveFinanceRouteAuthContext(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@/lib/workspace-helper', () => ({
  getWorkspaceConfig: (...args: Parameters<typeof mocks.getWorkspaceConfig>) =>
    mocks.getWorkspaceConfig(...args),
}));

function createAdmin() {
  const eqId = vi.fn(async () => ({ error: null }));
  const eqWsId = vi.fn(() => ({ eq: eqId }));
  const upsert = vi.fn(() => ({ eq: eqWsId }));
  const from = vi.fn(() => ({ upsert }));

  return {
    admin: { from },
    eqId,
    eqWsId,
    from,
    upsert,
  };
}

describe('workspace settings route CMS config access', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    const admin = createAdmin();
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: admin.admin,
      normalizedWorkspaceId: 'normalized-ws',
      ok: true,
    });
    mocks.getWorkspaceConfig.mockResolvedValue('true');
  });

  it('reads ENABLE_CMS_GAMES through external project access', async () => {
    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/settings/[configId]/route'
    );

    const response = await GET(
      new Request(
        `http://localhost/api/v1/workspaces/ws-1/settings/${ENABLE_CMS_GAMES_CONFIG_ID}`
      ),
      {
        params: Promise.resolve({
          configId: ENABLE_CMS_GAMES_CONFIG_ID,
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ value: 'true' });
    expect(mocks.requireWorkspaceExternalProjectAccess).toHaveBeenCalledWith({
      mode: 'read',
      request: expect.any(Request),
      wsId: 'ws-1',
    });
    expect(mocks.getWorkspaceConfig).toHaveBeenCalledWith(
      'normalized-ws',
      ENABLE_CMS_GAMES_CONFIG_ID
    );
    expect(mocks.getFinanceRouteContext).not.toHaveBeenCalled();
  });

  it('updates ENABLE_CMS_GAMES through external project management access', async () => {
    const admin = createAdmin();
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      admin: admin.admin,
      normalizedWorkspaceId: 'normalized-ws',
      ok: true,
    });

    const { PUT } = await import(
      '@/app/api/v1/workspaces/[wsId]/settings/[configId]/route'
    );

    const response = await PUT(
      new Request(
        `http://localhost/api/v1/workspaces/ws-1/settings/${ENABLE_CMS_GAMES_CONFIG_ID}`,
        {
          body: JSON.stringify({ value: 'false' }),
          method: 'PUT',
        }
      ),
      {
        params: Promise.resolve({
          configId: ENABLE_CMS_GAMES_CONFIG_ID,
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.requireWorkspaceExternalProjectAccess).toHaveBeenCalledWith({
      mode: 'manage',
      request: expect.any(Request),
      wsId: 'ws-1',
    });
    expect(admin.from).toHaveBeenCalledWith('workspace_configs');
    expect(admin.upsert).toHaveBeenCalledWith({
      id: ENABLE_CMS_GAMES_CONFIG_ID,
      updated_at: expect.any(String),
      value: 'false',
      ws_id: 'normalized-ws',
    });
    expect(admin.eqWsId).toHaveBeenCalledWith('ws_id', 'normalized-ws');
    expect(admin.eqId).toHaveBeenCalledWith('id', ENABLE_CMS_GAMES_CONFIG_ID);
    expect(mocks.getFinanceRouteContext).not.toHaveBeenCalled();
  });
});
