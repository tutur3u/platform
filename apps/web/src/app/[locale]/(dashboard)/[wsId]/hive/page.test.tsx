import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  HiveStudio: vi.fn(() => null),
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
  withForwardedInternalApiAuth: vi.fn(() => ({ auth: 'forwarded' })),
}));

vi.mock('@tuturuuu/hive-ui/config', () => ({
  HIVE_REALTIME_URL: 'wss://hive-realtime.test/realtime',
}));

vi.mock('@tuturuuu/hive-ui/studio', () => ({
  HiveStudio: mocks.HiveStudio,
}));

vi.mock('@tuturuuu/internal-api', () => ({
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
      servers: [{ id: 'server-1', name: 'Main server' }],
    });
  });

  it('renders the shared Hive Studio inside apps/web without filtering servers by workspace', async () => {
    const HivePage = (await import('./page')).default;

    const result = await HivePage({
      params: Promise.resolve({ locale: 'en', wsId: 'personal' }),
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
      initialServers: {
        servers: [{ id: 'server-1', name: 'Main server' }],
      },
      isAdmin: true,
      realtimeUrl: 'wss://hive-realtime.test/realtime',
    });
  });
});
