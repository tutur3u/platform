import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getWorkspaceMock, listCalendarConnectionsMock } = vi.hoisted(() => ({
  getWorkspaceMock: vi.fn(),
  listCalendarConnectionsMock: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/workspace-settings', () => ({
  createWorkspaceSettingsNavGroup: () => ({ label: 'Workspace', items: [] }),
  SatelliteProfileSettingsPanel: () => null,
  SatelliteWorkspaceSettingsPanel: () => null,
  SettingsWorkspaceBreadcrumb: () => null,
}));
vi.mock('@tuturuuu/ui/custom/settings/keyboard-shortcuts-settings', () => ({
  KeyboardShortcutsSettings: () => null,
}));
vi.mock('@/context/sidebar-context', () => ({ useSidebar: () => ({}) }));
vi.mock('./calendar/calendar-settings-content', () => ({
  CalendarSettingsContent: () => null,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api/calendar', () => ({
  listCalendarConnections: listCalendarConnectionsMock,
}));

vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  getWorkspace: getWorkspaceMock,
}));

vi.mock(
  '@tuturuuu/ui/calendar-app/components/calendar-connections-unified',
  () => ({
    default: ({ wsId, variant }: { wsId: string; variant?: string }) => (
      <div
        data-testid="calendar-connections-manager"
        data-variant={variant ?? 'compact'}
      >
        {wsId}
      </div>
    ),
  })
);

vi.mock('@tuturuuu/ui/custom/settings/appearance-settings', () => ({
  AppearanceSettings: () => <div>appearance</div>,
}));

vi.mock('@tuturuuu/ui/custom/settings/lunar-calendar-settings', () => ({
  LunarCalendarSettings: () => <div>lunar calendar</div>,
}));

vi.mock('@tuturuuu/ui/custom/settings/sidebar-settings', () => ({
  default: () => <div>sidebar settings</div>,
}));

vi.mock('@tuturuuu/ui/custom/settings-dialog-shell', () => ({
  SettingsDialogShell: ({
    children,
    navItems,
    onActiveTabChange,
  }: {
    children: ReactNode;
    navItems: Array<{
      items: Array<{
        label: string;
        name: string;
      }>;
    }>;
    onActiveTabChange: (tab: string) => void;
  }) => (
    <div>
      <nav>
        {navItems.flatMap((group) =>
          group.items.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => onActiveTabChange(item.name)}
            >
              {item.label}
            </button>
          ))
        )}
      </nav>
      <main>{children}</main>
    </div>
  ),
}));

vi.mock('@tuturuuu/ui/custom/settings-item-tab', () => ({
  SettingItemTab: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@tuturuuu/ui/hooks/use-calendar-sync', () => ({
  CalendarSyncProvider: ({
    children,
    initialCalendarConnections,
    wsId,
  }: {
    children: ReactNode;
    initialCalendarConnections: unknown[];
    wsId: string;
  }) => (
    <div
      data-testid="sync-provider"
      data-workspace={wsId}
      data-connection-count={initialCalendarConnections.length}
    >
      {children}
    </div>
  ),
}));

vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserBooleanConfig: () => ({ value: true }),
}));

import { SettingsDialog } from './settings-dialog';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSettingsDialog(wsId = 'workspace-1') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsDialog
        wsId={wsId}
        user={
          {
            display_name: 'Ada',
            email: 'ada@example.com',
            id: 'user-1',
          } as WorkspaceUser
        }
      />
    </QueryClientProvider>
  );
}

describe('Calendar settings dialog', () => {
  it('shows lunar settings and the integrations tab', () => {
    getWorkspaceMock.mockResolvedValue({ id: 'workspace-1' });
    listCalendarConnectionsMock.mockResolvedValue([]);

    renderSettingsDialog();

    expect(screen.getByText('lunar calendar')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'settings.calendar.integrations',
      })
    ).toBeTruthy();
  });

  it('shows the calendar integrations tab and mounts the connections manager', async () => {
    getWorkspaceMock.mockResolvedValue({ id: 'workspace-1' });
    listCalendarConnectionsMock.mockResolvedValue([
      { calendar_id: 'primary', id: 'connection-1' },
    ]);

    renderSettingsDialog();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'settings.calendar.integrations',
      })
    );

    const manager = await screen.findByTestId('calendar-connections-manager');
    expect(manager.textContent).toBe('workspace-1');
    expect(manager.getAttribute('data-variant')).toBe('settings');
    await waitFor(() =>
      expect(listCalendarConnectionsMock).toHaveBeenCalledWith('workspace-1')
    );
  });
  it('waits for the personal alias resolution before mounting UUID-only calendar consumers', async () => {
    let resolveWorkspace!: (value: { id: string }) => void;
    getWorkspaceMock.mockReturnValue(
      new Promise((resolve) => {
        resolveWorkspace = resolve;
      })
    );
    listCalendarConnectionsMock.mockResolvedValue([]);
    renderSettingsDialog('personal');
    fireEvent.click(
      screen.getByRole('button', { name: 'settings.calendar.integrations' })
    );
    expect(screen.queryByTestId('calendar-connections-manager')).toBeNull();
    expect(listCalendarConnectionsMock).not.toHaveBeenCalled();
    resolveWorkspace({ id: 'resolved-personal-workspace' });
    const manager = await screen.findByTestId('calendar-connections-manager');
    expect(manager.textContent).toBe('resolved-personal-workspace');
    expect(
      screen.getByTestId('sync-provider').getAttribute('data-workspace')
    ).toBe('resolved-personal-workspace');
    await waitFor(() =>
      expect(listCalendarConnectionsMock).toHaveBeenCalledWith(
        'resolved-personal-workspace'
      )
    );
    expect(listCalendarConnectionsMock).not.toHaveBeenCalledWith('personal');
  });

  it('does not issue calendar requests when workspace resolution fails', async () => {
    getWorkspaceMock.mockRejectedValue(new Error('Workspace unavailable'));
    renderSettingsDialog('personal');
    fireEvent.click(
      screen.getByRole('button', { name: 'settings.calendar.integrations' })
    );
    await waitFor(() =>
      expect(getWorkspaceMock).toHaveBeenCalledWith('personal')
    );
    expect(screen.queryByTestId('sync-provider')).toBeNull();
    expect(listCalendarConnectionsMock).not.toHaveBeenCalled();
  });
});
