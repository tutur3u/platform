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
  }: {
    children: ReactNode;
    initialCalendarConnections: unknown[];
  }) => (
    <div data-connection-count={initialCalendarConnections.length}>
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

function renderSettingsDialog() {
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
        wsId="workspace-1"
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
});
