import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
  getWorkspace: vi.fn(),
  headers: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/server', () => ({
  connection: () => mocks.connection(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: () => mocks.headers(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => mocks.notFound(),
  redirect: (url: string) => mocks.redirect(url),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: (app: string) =>
    mocks.getSatelliteAppSessionUser(app),
}));

vi.mock('@tuturuuu/utils/request-workspace', () => ({
  getRequestWorkspace: (...args: unknown[]) => mocks.getWorkspace(...args),
}));

vi.mock('@tuturuuu/satellite/notification-popover', () => ({
  default: () => null,
}));
vi.mock('@tuturuuu/satellite/workspace-invitation', () => ({
  getPendingWorkspaceInvitation: vi.fn(),
  SatelliteWorkspaceInvitationCard: () => null,
}));
vi.mock('@tuturuuu/satellite/workspace-layout-helpers', () => ({
  getSidebarBehaviorUpdatedAt: vi.fn(),
  getSidebarCollapsedState: vi.fn(),
  parseSidebarBehavior: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/realtime-log-provider', () => ({
  RealtimeLogProvider: () => null,
}));
vi.mock(
  '@tuturuuu/tasks-ui/tu-do/providers/workspace-presence-provider',
  () => ({ WorkspacePresenceProvider: () => null })
);
vi.mock('@tuturuuu/tasks-ui/tu-do/shared/task-dialog-wrapper', () => ({
  TaskDialogWrapper: () => null,
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/tasks-route-context', () => ({
  TasksRouteProvider: () => null,
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  WorkspaceVisibilityProvider: () => null,
}));
vi.mock('@/components/command-center/tasks-command-launcher', () => ({
  TasksCommandLauncher: () => null,
}));
vi.mock('@/components/settings/settings-dialog-host', () => ({
  SettingsDialogHost: () => null,
}));
vi.mock('@/context/sidebar-context', () => ({
  SidebarProvider: () => null,
}));
vi.mock('../../navbar-actions', () => ({ default: () => null }));
vi.mock('../../user-nav', () => ({ UserNav: () => null }));
vi.mock('./navigation', () => ({ getNavigationLinks: vi.fn() }));
vi.mock('./structure', () => ({ Structure: () => null }));

import Layout from './layout';

describe('tasks [wsId] layout auth guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.headers.mockResolvedValue(new Headers());
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`);
    });
  });

  it('fails closed for signed-out requests before loading any workspace', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);

    await expect(
      Layout({
        children: null,
        params: Promise.resolve({ wsId: 'personal' }),
      })
    ).rejects.toThrow('redirect:/login');

    expect(mocks.getSatelliteAppSessionUser).toHaveBeenCalledWith('tasks');
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
  });
});
