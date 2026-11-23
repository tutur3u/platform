import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { SettingsDialogShell } from '@tuturuuu/ui/custom/settings-dialog-shell';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWebAccountSettingsUrl } from './account-settings-links';
import {
  ACCOUNT_SETTINGS_TAB_IDS,
  createAccountSettingsNavGroup,
  isAccountSettingsTab,
  isWebManagedAccountTab,
} from './account-settings-navigation';
import { SatelliteAccountSettingsPanel } from './account-settings-panel';
import { SatelliteDefaultSettingsDialog } from './default-settings-dialog';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/ui/custom/settings/appearance-settings', () => ({
  AppearanceSettings: ({
    canManageVersionBadge,
  }: {
    canManageVersionBadge: boolean;
  }) =>
    canManageVersionBadge ? (
      <button type="button">Show version badge</button>
    ) : null,
}));
vi.mock('@tuturuuu/ui/custom/settings-dialog-shell', () => ({
  SettingsDialogShell: ({
    children,
    navItems,
    onActiveTabChange,
  }: ComponentProps<typeof SettingsDialogShell>) => (
    <>
      {navItems.flatMap(({ items }) =>
        items.map(({ label, name }) => (
          <button
            key={name}
            onClick={() => onActiveTabChange(name)}
            type="button"
          >
            {label}
          </button>
        ))
      )}
      {children}
    </>
  ),
}));
vi.mock('../profile-settings/profile-settings-panel', () => ({
  SatelliteProfileSettingsPanel: ({ user }: { user: WorkspaceUser }) => (
    <div data-testid="profile-panel">{user.id}</div>
  ),
}));

const user = { email: 'ada@example.com', id: 'user-1' } as WorkspaceUser;

afterEach(cleanup);

describe('shared satellite account settings', () => {
  it('uses an explicit server decision even when the profile has a staff email', () => {
    const props = {
      centralUrl: 'https://tuturuuu.com',
      defaultTab: 'appearance',
      user: { ...user, email: 'staff@tuturuuu.com' },
    };
    const { rerender } = render(
      <SatelliteDefaultSettingsDialog
        {...props}
        canManageVersionBadge={false}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Show version badge' })
    ).toBeNull();
    rerender(
      <SatelliteDefaultSettingsDialog {...props} canManageVersionBadge />
    );
    expect(
      screen.getByRole('button', { name: 'Show version badge' })
    ).toBeDefined();
  });

  it('opens the sidebar panel only when the app supplies a tab', () => {
    const props = { centralUrl: 'https://tuturuuu.com', user: null };
    const { rerender } = render(<SatelliteDefaultSettingsDialog {...props} />);
    expect(screen.queryByRole('button', { name: 'Sidebar' })).toBeNull();

    rerender(
      <SatelliteDefaultSettingsDialog
        {...props}
        sidebarTab={{
          content: <button type="button">Show navigation labels</button>,
          description: 'Adjust navigation',
          label: 'Sidebar',
        }}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Show navigation labels' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sidebar' }));
    expect(
      screen.getByRole('button', { name: 'Show navigation labels' })
    ).toBeDefined();
  });

  it('exposes profile, accounts, security, sessions and integrations in one group', () => {
    const group = createAccountSettingsNavGroup((key) => key);
    expect(group.label).toBe('satellite-account-settings.title');
    expect(group.items.map((item) => item.name)).toEqual([
      ...ACCOUNT_SETTINGS_TAB_IDS,
    ]);
    expect(ACCOUNT_SETTINGS_TAB_IDS).toEqual([
      'profile',
      'accounts',
      'security',
      'sessions',
      'account_integrations',
    ]);
  });

  it('classifies account tabs and the web-managed subset', () => {
    expect(isAccountSettingsTab('security')).toBe(true);
    expect(isAccountSettingsTab('appearance')).toBe(false);
    expect(isWebManagedAccountTab('profile')).toBe(false);
    expect(isWebManagedAccountTab('sessions')).toBe(true);
    expect(isWebManagedAccountTab(null)).toBe(false);
  });

  it('links to the same tab of the web settings dialog on the web origin', () => {
    expect(buildWebAccountSettingsUrl('https://tuturuuu.com', 'security')).toBe(
      'https://tuturuuu.com/personal?settingsDialog=open&settingsTab=security'
    );
    expect(
      buildWebAccountSettingsUrl(
        'http://localhost:7803/en/ignored?x=1',
        'accounts'
      )
    ).toBe(
      'http://localhost:7803/personal?settingsDialog=open&settingsTab=accounts'
    );
  });

  it('renders the profile panel inline for the profile tab', () => {
    render(
      <SatelliteAccountSettingsPanel
        activeTab="profile"
        centralUrl="https://tuturuuu.com"
        user={user}
      />
    );
    expect(screen.getByTestId('profile-panel').textContent).toBe('user-1');
  });

  it.each(['accounts', 'security', 'sessions'] as const)(
    'links %s out to web instead of handling it in the satellite',
    (tab) => {
      render(
        <SatelliteAccountSettingsPanel
          activeTab={tab}
          centralUrl="https://tuturuuu.com"
          user={user}
        />
      );
      const link = screen.getByRole('link', { name: /open_in_tuturuuu/ });
      expect(link.getAttribute('href')).toBe(
        `https://tuturuuu.com/personal?settingsDialog=open&settingsTab=${tab}`
      );
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.queryByTestId('profile-panel')).toBeNull();
    }
  );

  it('renders the integrations panel inline for the integrations tab', () => {
    render(
      <SatelliteAccountSettingsPanel
        activeTab="account_integrations"
        centralUrl="https://tuturuuu.com"
        user={user}
      />
    );
    expect(screen.getByText('upskii')).toBeDefined();
    expect(screen.queryByRole('link', { name: /open_in_tuturuuu/ })).toBeNull();
  });

  it('renders nothing for app tabs or signed-out users', () => {
    const { container, rerender } = render(
      <SatelliteAccountSettingsPanel
        activeTab="appearance"
        centralUrl="https://tuturuuu.com"
        user={user}
      />
    );
    expect(container.innerHTML).toBe('');
    rerender(
      <SatelliteAccountSettingsPanel
        activeTab="security"
        centralUrl="https://tuturuuu.com"
        user={null}
      />
    );
    expect(container.innerHTML).toBe('');
  });
});
