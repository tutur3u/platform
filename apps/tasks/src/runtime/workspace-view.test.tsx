import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceView } from './workspace-view';
import type { TasksWorkspaceModel } from './workspace-model.server';

// Shell suppliers expose the actual expanded and collapsed action slots.
vi.mock('../app/[locale]/(dashboard)/[wsId]/structure', () => ({
  Structure: ({
    actions,
    userPopover,
    children,
  }: {
    actions: ReactNode;
    userPopover: ReactNode;
    children: ReactNode;
  }) => (
    <>
      <aside data-testid="expanded">{actions}</aside>
      <aside data-testid="collapsed">{userPopover}</aside>
      {children}
    </>
  ),
}));
vi.mock('../app/[locale]/(dashboard)/[wsId]/navigation', () => ({
  buildNavigationLinks: () => [],
}));
vi.mock('../context/sidebar-context', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@tuturuuu/supabase/next/realtime-log-provider', () => ({
  RealtimeLogProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock(
  '@tuturuuu/tasks-ui/tu-do/providers/workspace-presence-provider',
  () => ({
    WorkspacePresenceProvider: ({ children }: { children: ReactNode }) =>
      children,
  })
);
vi.mock('@tuturuuu/tasks-ui/tu-do/shared/task-dialog-wrapper', () => ({
  TaskDialogWrapper: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/tasks-route-context', () => ({
  TasksRouteProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../components/settings/settings-dialog-host', () => ({
  SettingsDialogHost: () => null,
}));
vi.mock('../components/command-center/tasks-command-launcher', () => ({
  TasksCommandLauncher: () => null,
}));
vi.mock('@tuturuuu/satellite/notification-popover-view', () => ({
  default: () => null,
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useParams: () => ({ wsId: 'workspace-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/en/workspace-1/tasks',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/ui/report-problem-dialog', () => ({
  ReportProblemDialog: () => null,
}));
vi.mock('@tuturuuu/ui/custom/satellite-user-menu-items', () => ({
  SatelliteUserMenuItems: () => null,
}));
vi.mock(
  '../../../../packages/satellite/src/components/app-guide-overlay',
  () => ({ AppGuideOverlay: () => null })
);

afterEach(cleanup);

const profile = {
  id: 'fictional-user',
  display_name: 'Orchard Member',
  handle: 'orchard-member',
  email: 'member@example.invalid',
  avatar_url: null,
} as TasksWorkspaceModel['profile'];

function mount(user: TasksWorkspaceModel['profile']) {
  const model = {
    kind: 'workspace',
    user: { id: 'fictional-user' },
    profile: user,
    workspace: {
      id: 'workspace-1',
      name: 'Orchard',
      personal: true,
      tier: 'PRO',
    },
    slug: 'workspace-1',
    behavior: 'expanded',
    behaviorUpdatedAt: null,
    defaultCollapsed: false,
    canManageCycles: false,
  } as unknown as TasksWorkspaceModel;
  const Adapter = withNuqsTestingAdapter({ searchParams: '' });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Adapter>
        <WorkspaceView model={model}>
          <p>Tasks content</p>
        </WorkspaceView>
      </Adapter>
    </QueryClientProvider>
  );
  return {
    expanded: within(screen.getByTestId('expanded')).getByRole('button'),
    collapsed: within(screen.getByTestId('collapsed')).getByRole('button'),
  };
}

describe('Tasks footer through WorkspaceView and the real user menu', () => {
  it('shows account metadata in the expanded trigger and keeps the rail compact', () => {
    const { expanded, collapsed } = mount(profile);
    expect(expanded.textContent).toContain('Orchard Member');
    expect(expanded.textContent).toContain('member@example.invalid');
    expect(collapsed.textContent).not.toContain('Orchard Member');
    expect(collapsed.textContent).not.toContain('member@example.invalid');
    expect(expanded.parentElement?.classList.contains('min-w-0')).toBe(true);
  });

  it.each([
    [null, 'common.unnamed', ''],
    [{ ...profile, display_name: null, email: null }, 'orchard-member', ''],
    [
      { ...profile, display_name: null, handle: null },
      'common.unnamed',
      'member@example.invalid',
    ],
  ])('renders a safe fallback for profile %j', (user, name, email) => {
    const { expanded, collapsed } = mount(
      user as TasksWorkspaceModel['profile']
    );
    expect(expanded.textContent).toContain(name);
    if (email) expect(expanded.textContent).toContain(email);
    expect(expanded.textContent).not.toContain('undefined');
    expect(collapsed.textContent).not.toContain(name);
  });
});
