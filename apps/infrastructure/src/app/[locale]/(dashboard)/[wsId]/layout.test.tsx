import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const rootId = '00000000-0000-0000-0000-000000000000';

  return {
    cookies: vi.fn(),
    getNavigationLinks: vi.fn(),
    getPendingWorkspaceInvitation: vi.fn(),
    getPermissions: vi.fn(),
    getSatelliteAppSessionUser: vi.fn(),
    getSidebarBehaviorUpdatedAt: vi.fn(),
    getSidebarCollapsedState: vi.fn(),
    getWorkspace: vi.fn(),
    headers: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error('not-found');
    }),
    parseSidebarBehavior: vi.fn(),
    redirect: vi.fn((url: string) => {
      throw new Error(`redirect:${url}`);
    }),
    resolveWorkspaceId: vi.fn((wsId: string) =>
      wsId === 'internal' ? rootId : wsId
    ),
    rootId,
    toWorkspaceSlug: vi.fn(() => 'internal'),
  };
});

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/satellite/sidebar-context', () => ({
  SidebarProvider: ({
    children,
    initialBehavior,
    initialBehaviorUpdatedAt,
  }: {
    children: ReactNode;
    initialBehavior: string;
    initialBehaviorUpdatedAt: number | null;
  }) => (
    <section
      data-behavior={initialBehavior}
      data-testid="sidebar-provider"
      data-updated-at={initialBehaviorUpdatedAt ?? ''}
    >
      {children}
    </section>
  ),
}));

vi.mock('@tuturuuu/satellite/workspace-invitation', () => ({
  getPendingWorkspaceInvitation: mocks.getPendingWorkspaceInvitation,
  SatelliteWorkspaceInvitationCard: () => (
    <div data-testid="workspace-invitation" />
  ),
}));

vi.mock('@tuturuuu/satellite/workspace-layout-helpers', () => ({
  getSidebarBehaviorUpdatedAt: mocks.getSidebarBehaviorUpdatedAt,
  getSidebarCollapsedState: mocks.getSidebarCollapsedState,
  parseSidebarBehavior: mocks.parseSidebarBehavior,
}));

vi.mock('@tuturuuu/supabase/next/realtime-log-provider', () => ({
  RealtimeLogProvider: ({
    children,
    wsId,
  }: {
    children: ReactNode;
    wsId: string;
  }) => (
    <section data-testid="realtime-provider" data-ws-id={wsId}>
      {children}
    </section>
  ),
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  ROOT_WORKSPACE_ID: mocks.rootId,
  resolveWorkspaceId: mocks.resolveWorkspaceId,
  toWorkspaceSlug: mocks.toWorkspaceSlug,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  getWorkspace: mocks.getWorkspace,
}));

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
  headers: mocks.headers,
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

vi.mock('../../navbar-actions', () => ({
  default: () => <div data-testid="navbar-actions" />,
}));

vi.mock('../../user-nav', () => ({
  UserNav: () => <div data-testid="user-nav" />,
}));

vi.mock('./navigation', () => ({
  getNavigationLinks: mocks.getNavigationLinks,
}));

vi.mock('./structure', () => ({
  Structure: ({
    children,
    defaultCollapsed,
    links,
    wsId,
  }: {
    children: ReactNode;
    defaultCollapsed: boolean;
    links: unknown[];
    wsId: string;
  }) => (
    <section
      data-collapsed={String(defaultCollapsed)}
      data-link-count={links.length}
      data-testid="structure"
      data-ws-id={wsId}
    >
      {children}
    </section>
  ),
}));

function allowInfrastructurePermission() {
  return { withoutPermission: vi.fn(() => false) };
}

async function renderLayout(wsId = 'internal') {
  const Layout = (await import('./layout')).default;

  return Layout({
    children: <div>dashboard child</div>,
    params: Promise.resolve({ wsId }),
  });
}

describe('Infrastructure dashboard layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.cookies.mockResolvedValue({ get: vi.fn() });
    mocks.getNavigationLinks.mockResolvedValue([
      { href: '/internal', title: 'Overview' },
    ]);
    mocks.getPendingWorkspaceInvitation.mockResolvedValue(null);
    mocks.getPermissions.mockResolvedValue(allowInfrastructurePermission());
    mocks.getSatelliteAppSessionUser.mockResolvedValue({
      email: 'ops@tuturuuu.com',
      id: 'user-1',
    });
    mocks.getSidebarBehaviorUpdatedAt.mockReturnValue(123);
    mocks.getSidebarCollapsedState.mockReturnValue(true);
    mocks.getWorkspace.mockResolvedValue({
      id: mocks.rootId,
      joined: true,
      personal: false,
      tier: 'FREE',
    });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.parseSidebarBehavior.mockReturnValue('hover');
  });

  it('redirects unauthenticated users to login', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);

    await expect(renderLayout()).rejects.toThrow('redirect:/login');
    expect(mocks.redirect).toHaveBeenCalledWith('/login');
  });

  it('rejects non-root workspaces before loading the session', async () => {
    await expect(renderLayout('other-workspace')).rejects.toThrow('not-found');

    expect(mocks.notFound).toHaveBeenCalled();
    expect(mocks.getSatelliteAppSessionUser).not.toHaveBeenCalled();
  });

  it('rejects users without infrastructure view permission', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => true),
    });

    await expect(renderLayout()).rejects.toThrow('not-found');

    expect(mocks.getPermissions).toHaveBeenCalledWith({
      user: expect.objectContaining({ id: 'user-1' }),
      wsId: mocks.rootId,
    });
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it('renders the satellite structure for the root infrastructure workspace', async () => {
    const result = await renderLayout();

    render(result);

    expect(screen.getByTestId('sidebar-provider')).toHaveAttribute(
      'data-behavior',
      'hover'
    );
    expect(screen.getByTestId('structure')).toHaveAttribute(
      'data-ws-id',
      'internal'
    );
    expect(screen.getByTestId('structure')).toHaveAttribute(
      'data-collapsed',
      'true'
    );
    expect(screen.getByTestId('realtime-provider')).toHaveAttribute(
      'data-ws-id',
      mocks.rootId
    );
    expect(screen.getByText('dashboard child')).toBeInTheDocument();
    expect(mocks.getNavigationLinks).toHaveBeenCalledWith({
      personalOrWsId: 'internal',
    });
  });
});
