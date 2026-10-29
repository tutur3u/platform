import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { Workspace } from '@tuturuuu/types';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildNavigationLinks } from '@/app/[locale]/(dashboard)/[wsId]/navigation';
import { SettingsDialog } from '@/components/settings/settings-dialog';

const mocks = vi.hoisted(() => ({
  shell: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({ getWorkspace: vi.fn() }));
vi.mock('@tuturuuu/satellite/account-settings', () => ({
  createAccountSettingsNavGroup: () => ({ label: 'Account', items: [] }),
  SatelliteAccountSettingsPanel: () => null,
}));
vi.mock('@tuturuuu/satellite/workspace-settings', () => ({
  createWorkspaceMembersNavLink: () => ({
    title: 'Members',
    openSettingsDialog: { tab: 'workspace_members' },
  }),
  createWorkspaceSettingsNavGroup: () => ({ label: 'Workspace', items: [] }),
  SatelliteWorkspaceSettingsPanel: () => null,
  SettingsWorkspaceBreadcrumb: () => null,
}));
vi.mock('@tuturuuu/ui/custom/settings-dialog-shell', () => ({
  SettingsDialogShell: (props: { children: ReactNode }) => {
    mocks.shell(props);
    return <div>{props.children}</div>;
  },
}));
vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserBooleanConfig: () => ({ value: true }),
}));
vi.mock('@tuturuuu/tasks-ui/settings/task-settings', () => ({
  TaskSettings: () => <div>General task settings</div>,
}));
vi.mock('@tuturuuu/tasks-ui/settings/task-card-hotkey-settings', () => ({
  TaskCardHotkeySettings: () => null,
}));
vi.mock('@tuturuuu/ui/custom/settings/appearance-settings', () => ({
  AppearanceSettings: () => null,
}));
vi.mock('@tuturuuu/ui/custom/settings/keyboard-shortcuts-settings', () => ({
  KeyboardShortcutsSettings: () => null,
}));
vi.mock('@tuturuuu/ui/custom/settings/lunar-calendar-settings', () => ({
  LunarCalendarSettings: () => null,
}));
vi.mock('@tuturuuu/ui/custom/settings/sidebar-settings', () => ({
  default: () => null,
}));
vi.mock('@tuturuuu/ui/pwa-status', () => ({ PwaStatus: () => null }));
vi.mock('@/context/sidebar-context', () => ({ useSidebar: vi.fn() }));
vi.mock('@/components/settings/task-board-settings-picker', () => ({
  TaskBoardSettingsPicker: () => null,
}));
vi.mock('@/components/settings/task-default-board-settings', () => ({
  TaskDefaultBoardSettings: () => null,
}));
vi.mock('@/components/settings/task-intelligence-settings-panel', () => ({
  TaskIntelligenceSettingsPanel: () => null,
}));
vi.mock('@/components/settings/task-settings-panels', () => ({
  TaskBoardSettingsPanel: () => null,
  TaskDraftsSettings: () => null,
  TaskEstimatesSettings: () => null,
  TaskHabitsSettings: () => null,
  TaskLabelsSettings: () => null,
  TaskLogsSettings: () => null,
  TaskNotesSettings: () => null,
  TaskProjectsSettings: () => null,
  TaskShareSettingsPanel: () => null,
  TaskTemplatesSettings: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Hidden Initiatives entry points', () => {
  it.each(['personal', 'workspace-1'])(
    'omits Initiatives from sidebar links, children and aliases for %s',
    (wsId) => {
      const links = buildNavigationLinks((key: string) => key, wsId);
      expect(JSON.stringify(links)).not.toMatch(/initiative/i);
      expect(links[0]).toMatchObject({ href: `/${wsId}/tasks` });
    }
  );

  it('omits Initiatives from settings navigation/search and maps old tabs to general settings', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsDialog
          user={{ id: 'actor' }}
          wsId="workspace-1"
          centralUrl="https://tuturuuu.com"
          defaultTab="task_initiatives"
          workspace={{ id: 'workspace-1' } as Workspace}
        />
      </QueryClientProvider>
    );
    const props = mocks.shell.mock.lastCall?.[0];
    expect(JSON.stringify(props.navItems)).not.toMatch(/initiative/i);
    expect(props.activeTab).toBe('tasks_general');
    expect(screen.getByText('General task settings')).toBeTruthy();
  });
});
