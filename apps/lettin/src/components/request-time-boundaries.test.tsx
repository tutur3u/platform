import { Suspense } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import Layout from '../app/[locale]/[wsId]/layout';
import WorldPage from '../app/[locale]/[wsId]/worlds/[worldId]/page';
import LoginPage from '../app/[locale]/login/page';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  user: vi.fn(),
  session: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(path);
  }),
}));
vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));
vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.user,
  getSatelliteAppSession: mocks.session,
}));
vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaces: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({ getWorkspace: vi.fn() }));
vi.mock('@tuturuuu/satellite/notification-popover', () => ({
  default: () => null,
}));
vi.mock('@tuturuuu/satellite/sidebar-context', () => ({
  SidebarProvider: () => null,
}));
vi.mock('@tuturuuu/satellite/workspace-invitation', () => ({
  getPendingWorkspaceInvitation: vi.fn(),
}));
vi.mock('@tuturuuu/satellite/workspace-layout-helpers', () => ({
  getSidebarBehaviorUpdatedAt: vi.fn(),
  getSidebarCollapsedState: vi.fn(),
  parseSidebarBehavior: vi.fn(),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  WorkspaceVisibilityProvider: () => null,
}));
vi.mock('./app-user-nav', () => ({ AppUserNav: () => null }));
vi.mock('./brand', () => ({ Brand: () => null }));
vi.mock('./workspace-invitation', () => ({ WorkspaceInvitation: () => null }));
vi.mock('../app/[locale]/[wsId]/navigation', () => ({
  getNavigationLinks: vi.fn(),
}));
vi.mock('../app/[locale]/[wsId]/structure', () => ({ Structure: () => null }));
vi.mock('./world-studio', () => ({ WorldStudio: () => null }));
vi.mock('@tuturuuu/auth/app-session', () => ({
  hasSupportedSupabaseAuthCookie: () => false,
  hasWebAppSessionTokenFromRequest: () => false,
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  normalizeAuthRedirectPath: (path: string) => path || '/',
}));
vi.mock('@/constants/common', () => ({
  BASE_URL: 'https://synthetic.test',
  WEB_APP_URL: 'https://web.synthetic.test',
}));

afterEach(() => vi.clearAllMocks());

for (const [name, shell] of [
  [
    'workspace',
    () =>
      Layout({
        children: null,
        params: Promise.resolve({ wsId: 'synthetic' }),
      }),
  ],
  [
    'world',
    () =>
      WorldPage({
        params: Promise.resolve({
          wsId: 'synthetic',
          worldId: '00000000-0000-4000-8000-000000000000',
        }),
        searchParams: Promise.resolve({ entry: 'synthetic-entry' }),
      }),
  ],
  [
    'login',
    () => LoginPage({ searchParams: Promise.resolve({ next: '/synthetic' }) }),
  ],
] as const) {
  test(`${name} suspends before request-time work`, async () => {
    let release!: () => void;
    mocks.connection.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const wrapper = shell();
    expect(wrapper.type).toBe(Suspense);
    expect(mocks.connection).not.toHaveBeenCalled();
    const child = wrapper.props.children;
    const pending = child.type(child.props);
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
    release();
    if (name === 'workspace') {
      await expect(pending).rejects.toThrow('/login');
      expect(mocks.user).toHaveBeenCalledWith('lettin');
    } else if (name === 'login') {
      await expect(pending).rejects.toThrow('https://web.synthetic.test/login');
      expect(mocks.session).toHaveBeenCalledWith('lettin');
    } else {
      expect((await pending).props.initialEntry).toBe('synthetic-entry');
    }
  });
}
