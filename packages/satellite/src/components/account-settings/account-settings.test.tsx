import { cleanup, render, screen } from '@testing-library/react';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildWebAccountSettingsUrl } from './account-settings-links';
import {
  ACCOUNT_SETTINGS_TAB_IDS,
  createAccountSettingsNavGroup,
  isAccountSettingsTab,
  isWebManagedAccountTab,
} from './account-settings-navigation';
import { SatelliteAccountSettingsPanel } from './account-settings-panel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('../profile-settings/profile-settings-panel', () => ({
  SatelliteProfileSettingsPanel: ({ user }: { user: WorkspaceUser }) => (
    <div data-testid="profile-panel">{user.id}</div>
  ),
}));

const user = { email: 'ada@example.com', id: 'user-1' } as WorkspaceUser;

afterEach(cleanup);

describe('shared satellite account settings', () => {
  it('exposes profile, accounts, security and sessions in one group', () => {
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
