import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from './layout';

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  getNavigationLinks: vi.fn(),
  getPendingWorkspaceInvitation: vi.fn(),
  getPermissions: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
  getSidebarBehaviorUpdatedAt: vi.fn(),
  getWorkspace: vi.fn(),
  hasRootExternalProjectsAdminPermission: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: (
    ...args: Parameters<typeof mocks.getSatelliteAppSessionUser>
  ) => mocks.getSatelliteAppSessionUser(...args),
}));

vi.mock('@tuturuuu/satellite/workspace-invitation', () => ({
  getPendingWorkspaceInvitation: (
    ...args: Parameters<typeof mocks.getPendingWorkspaceInvitation>
  ) => mocks.getPendingWorkspaceInvitation(...args),
  SatelliteWorkspaceInvitationCard: () => null,
}));

vi.mock('@tuturuuu/satellite/workspace-layout-helpers', () => ({
  getSidebarBehaviorUpdatedAt: (
    ...args: Parameters<typeof mocks.getSidebarBehaviorUpdatedAt>
  ) => mocks.getSidebarBehaviorUpdatedAt(...args),
}));

vi.mock('@tuturuuu/supabase/next/realtime-log-provider', () => ({
  RealtimeLogProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  getWorkspace: (...args: Parameters<typeof mocks.getWorkspace>) =>
    mocks.getWorkspace(...args),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (...args: Parameters<typeof mocks.cookieGet>) =>
      mocks.cookieGet(...args),
  })),
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('next/navigation', () => ({
  permanentRedirect: (...args: Parameters<typeof mocks.redirect>) =>
    mocks.redirect(...args),
  redirect: (...args: Parameters<typeof mocks.redirect>) =>
    mocks.redirect(...args),
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock('@/context/sidebar-context', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/lib/external-projects/access', () => ({
  hasRootExternalProjectsAdminPermission: (
    ...args: Parameters<typeof mocks.hasRootExternalProjectsAdminPermission>
  ) => mocks.hasRootExternalProjectsAdminPermission(...args),
}));

vi.mock('../../navbar-actions', () => ({
  default: () => null,
}));

vi.mock('../../user-nav', () => ({
  UserNav: () => null,
}));

vi.mock('./navigation', () => ({
  getNavigationLinks: (...args: Parameters<typeof mocks.getNavigationLinks>) =>
    mocks.getNavigationLinks(...args),
}));

vi.mock('./structure', () => ({
  Structure: ({ children }: { children: ReactNode }) => children,
}));

describe('CMS dashboard layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNavigationLinks.mockResolvedValue([]);
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
    mocks.getSatelliteAppSessionUser.mockResolvedValue({
      email: 'root@example.com',
      id: 'user-1',
    });
    mocks.getPermissions.mockResolvedValue({ containsPermission: vi.fn() });
    mocks.hasRootExternalProjectsAdminPermission.mockReturnValue(true);
    mocks.getSidebarBehaviorUpdatedAt.mockReturnValue(null);
    mocks.getWorkspace.mockResolvedValue({
      id: ROOT_WORKSPACE_ID,
      joined: true,
      personal: false,
      tier: 'FREE',
    });
  });

  it('uses root admin permissions instead of workspace membership for internal routes', async () => {
    mocks.getWorkspace.mockResolvedValue(null);

    await Layout({
      children: createElement('main'),
      params: Promise.resolve({ wsId: 'internal' }),
    });

    expect(mocks.getWorkspace).not.toHaveBeenCalled();
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: { email: 'root@example.com', id: 'user-1' },
      wsId: ROOT_WORKSPACE_ID,
    });
    expect(mocks.hasRootExternalProjectsAdminPermission).toHaveBeenCalled();
    expect(mocks.getPendingWorkspaceInvitation).not.toHaveBeenCalled();
    expect(mocks.getNavigationLinks).toHaveBeenCalledWith({
      personalOrWsId: 'internal',
      workspaceId: ROOT_WORKSPACE_ID,
    });
  });

  it('redirects non-root admins away from internal routes', async () => {
    mocks.hasRootExternalProjectsAdminPermission.mockReturnValue(false);

    await expect(
      Layout({
        children: createElement('main'),
        params: Promise.resolve({ wsId: 'internal' }),
      })
    ).rejects.toThrow('redirect:/no-access');

    expect(mocks.redirect).toHaveBeenCalledWith('/no-access');
  });

  it('redirects missing workspaces to no-access without reading invitations', async () => {
    mocks.getWorkspace.mockResolvedValue(null);

    await expect(
      Layout({
        children: createElement('main'),
        params: Promise.resolve({
          wsId: 'bea7429c-28e2-4159-b1b0-9212f803dcdf',
        }),
      })
    ).rejects.toThrow('redirect:/no-access');

    expect(mocks.getWorkspace).toHaveBeenCalledWith(
      'bea7429c-28e2-4159-b1b0-9212f803dcdf',
      {
        useAdmin: true,
        user: { email: 'root@example.com', id: 'user-1' },
      }
    );
    expect(mocks.getPendingWorkspaceInvitation).not.toHaveBeenCalled();
  });
});
