import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getPermissions = vi.fn();
  const verifySecret = vi.fn();
  const platformRoleMaybeSingle = vi.fn();
  const withSessionAuth = vi.fn(
    (
      handler: (
        request: NextRequest,
        context: {
          supabase: {
            from: ReturnType<typeof vi.fn>;
          };
          user: { email: string; id: string };
        },
        params: { wsId: string }
      ) => Promise<Response>
    ) =>
      async (
        request: NextRequest,
        routeContext?: {
          params?: Promise<{ wsId: string }> | { wsId: string };
        }
      ) =>
        handler(
          request,
          {
            supabase: {
              from: vi.fn((table: string) => {
                if (table !== 'platform_user_roles') {
                  throw new Error(`Unexpected table: ${table}`);
                }

                return {
                  select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      maybeSingle: platformRoleMaybeSingle,
                    })),
                  })),
                };
              }),
            },
            user: { email: 'agent@tuturuuu.com', id: 'user-1' },
          },
          routeContext?.params
            ? await Promise.resolve(routeContext.params)
            : { wsId: 'ws-1' }
        )
  );
  const serverLogger = {
    error: vi.fn(),
    warn: vi.fn(),
  };

  return {
    getPermissions,
    platformRoleMaybeSingle,
    serverLogger,
    verifySecret,
    withSessionAuth,
  };
});

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    getPermissions: mocks.getPermissions,
    verifySecret: mocks.verifySecret,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

function permissionsResult(wsId: string, permissions: string[]) {
  return {
    containsPermission: (permission: string) =>
      permissions.includes(permission),
    permissions,
    withoutPermission: (permission: string) =>
      !permissions.includes(permission),
    wsId,
  };
}

async function callRoute(wsId = 'ws-1') {
  const { GET } = await import(
    '@/app/api/v1/workspaces/[wsId]/settings/permissions/route'
  );

  return GET(
    new NextRequest(
      `http://localhost/api/v1/workspaces/${wsId}/settings/permissions`
    ),
    {
      params: Promise.resolve({ wsId }),
    }
  );
}

describe('workspace settings permissions route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.verifySecret.mockResolvedValue(false);
    mocks.platformRoleMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.getPermissions.mockImplementation(({ wsId }: { wsId: string }) =>
      Promise.resolve(
        permissionsResult(
          wsId,
          wsId === ROOT_WORKSPACE_ID ? [] : ['manage_workspace_settings']
        )
      )
    );
  });

  it('rejects users without workspace access before checking secrets or root settings', async () => {
    mocks.getPermissions.mockResolvedValueOnce(null);

    const response = await callRoute();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Workspace access denied',
    });
    expect(mocks.getPermissions).toHaveBeenCalledTimes(1);
    expect(mocks.verifySecret).not.toHaveBeenCalled();
    expect(mocks.platformRoleMaybeSingle).not.toHaveBeenCalled();
  });

  it('requires both manage_api_keys and the ENABLE_API_KEYS secret for API key settings', async () => {
    mocks.getPermissions.mockImplementation(({ wsId }: { wsId: string }) =>
      Promise.resolve(
        permissionsResult(
          wsId,
          wsId === ROOT_WORKSPACE_ID ? [] : ['manage_api_keys']
        )
      )
    );
    mocks.verifySecret.mockResolvedValue(false);

    const disabledResponse = await callRoute();
    const disabledPayload = await disabledResponse.json();

    expect(disabledPayload.manage_api_keys).toBe(true);
    expect(disabledPayload.enable_api_keys).toBe(false);
    expect(disabledPayload.available.api_keys).toBe(false);

    vi.resetModules();
    mocks.verifySecret.mockResolvedValue(true);

    const enabledResponse = await callRoute();
    const enabledPayload = await enabledResponse.json();

    expect(enabledPayload.available.api_keys).toBe(true);
  });

  it('exposes only permission-backed root settings entries', async () => {
    mocks.getPermissions.mockImplementation(({ wsId }: { wsId: string }) =>
      Promise.resolve(
        permissionsResult(
          wsId,
          wsId === ROOT_WORKSPACE_ID
            ? [
                'manage_external_migrations',
                'manage_mobile_deployment_vault',
                'manage_subscription',
                'manage_user_report_templates',
                'manage_workspace_integrations',
                'manage_workspace_members',
                'manage_workspace_roles',
                'manage_workspace_secrets',
                'manage_workspace_settings',
                'view_infrastructure',
              ]
            : [
                'manage_subscription',
                'manage_user_report_templates',
                'manage_workspace_integrations',
                'manage_workspace_members',
                'manage_workspace_roles',
                'manage_workspace_settings',
              ]
        )
      )
    );
    mocks.verifySecret.mockResolvedValue(true);
    mocks.platformRoleMaybeSingle.mockResolvedValue({
      data: { allow_discord_integrations: true },
      error: null,
    });

    const response = await callRoute(ROOT_WORKSPACE_ID);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.available).toMatchObject({
      api_keys: false,
      billing: true,
      infrastructure: true,
      infrastructure_external_apps: true,
      infrastructure_mobile_deployment: true,
      internal_projects: true,
      inquiries: true,
      integrations: true,
      migrations: true,
      platform_billing: true,
      platform_roles: true,
      reports: true,
      secrets: true,
      usage: true,
      workspace_members: true,
      workspace_roles: true,
      workspace_settings: true,
    });
  });

  it('exposes internal projects to root external-project managers without broad infrastructure', async () => {
    mocks.getPermissions.mockImplementation(({ wsId }: { wsId: string }) =>
      Promise.resolve(
        permissionsResult(
          wsId,
          wsId === ROOT_WORKSPACE_ID ? ['manage_external_projects'] : []
        )
      )
    );

    const response = await callRoute(ROOT_WORKSPACE_ID);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.can_manage_internal_projects).toBe(true);
    expect(payload.available.internal_projects).toBe(true);
    expect(payload.available.infrastructure).toBe(false);
  });
});
