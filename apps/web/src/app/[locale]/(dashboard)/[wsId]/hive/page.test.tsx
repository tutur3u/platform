import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockInternalApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string
    ) {
      super(message);
      this.name = 'InternalApiError';
    }
  }

  return {
    HiveStudio: vi.fn(() => null),
    InternalApiError: MockInternalApiError,
    getHiveBuildInfo: vi.fn(() => ({ commit: 'test-sha' })),
    getWebHivePageContext: vi.fn(),
    headers: vi.fn(),
    listHiveServers: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error('not-found');
    }),
    redirect: vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
    serverLoggerError: vi.fn(),
    withForwardedInternalApiAuth: vi.fn(() => ({ auth: 'forwarded' })),
  };
});

vi.mock('@tuturuuu/hive-ui/config', () => ({
  HIVE_REALTIME_URL: 'wss://hive-realtime.test/realtime',
}));

vi.mock('@tuturuuu/hive-ui/studio', () => ({
  HiveStudio: mocks.HiveStudio,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  InternalApiError: mocks.InternalApiError,
  withForwardedInternalApiAuth: mocks.withForwardedInternalApiAuth,
}));

vi.mock('@tuturuuu/internal-api/hive', () => ({
  listHiveServers: mocks.listHiveServers,
}));

vi.mock('@/lib/hive-build-info', () => ({
  getHiveBuildInfo: mocks.getHiveBuildInfo,
}));

vi.mock('@/lib/hive-page-context', () => ({
  getWebHivePageContext: mocks.getWebHivePageContext,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: mocks.serverLoggerError,
  },
}));

vi.mock('next/headers', () => ({
  headers: mocks.headers,
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

describe('web Hive page parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getWebHivePageContext.mockResolvedValue({
      access: {
        isAdmin: true,
        isMember: true,
        user: {
          email: 'user@example.com',
          id: 'user-1',
        },
      },
      workspace: {
        id: 'workspace-1',
      },
      wsId: 'workspace-1',
    });
    mocks.listHiveServers.mockResolvedValue({
      isAdmin: true,
      servers: [{ id: 'server-1', name: 'Main server' }],
    });
  });

  it('renders the shared Hive Studio inside apps/web without filtering servers by workspace', async () => {
    const HivePage = (await import('./page')).default;

    const result = await HivePage({
      params: Promise.resolve({ locale: 'en', wsId: 'personal' }),
      searchParams: Promise.resolve({
        panel: 'workflows',
        serverId: 'server-1',
        workflowId: 'workflow-1',
      }),
    });

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(isValidElement(result)).toBe(true);
    expect(result.type).toBe(mocks.HiveStudio);
    expect(mocks.listHiveServers).toHaveBeenCalledWith({ auth: 'forwarded' });
    expect(result.props).toMatchObject({
      buildInfo: { commit: 'test-sha' },
      currentUser: {
        email: 'user@example.com',
        id: 'user-1',
      },
      embedInDashboard: true,
      initialPanel: 'workflows',
      initialServerId: 'server-1',
      initialServers: {
        isAdmin: true,
        servers: [{ id: 'server-1', name: 'Main server' }],
      },
      initialWorkflowId: 'workflow-1',
      isAdmin: true,
      realtimeUrl: 'wss://hive-realtime.test/realtime',
    });
  });

  it('keeps the Hive Studio visible when the initial server preload fails', async () => {
    const HivePage = (await import('./page')).default;
    mocks.listHiveServers.mockRejectedValueOnce(
      new mocks.InternalApiError('Failed to resolve Hive access', 500)
    );

    const result = await HivePage({
      params: Promise.resolve({ locale: 'en', wsId: 'personal' }),
    });

    expect(isValidElement(result)).toBe(true);
    expect(result.type).toBe(mocks.HiveStudio);
    expect(result.props.initialServers).toEqual({
      isAdmin: true,
      servers: [],
    });
    expect(mocks.serverLoggerError).toHaveBeenCalledWith(
      'Failed to preload Hive servers',
      expect.objectContaining({
        message: 'Failed to resolve Hive access',
        status: 500,
      })
    );
  });
});
