import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/internal-api/auth', () => ({
  logoutCurrentWebAccountWithInternalApi: vi.fn(),
}));
vi.mock('@tuturuuu/ui/custom/satellite-user-menu', () => ({
  SatelliteUserMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@tuturuuu/ui/custom/satellite-user-menu-items', () => ({
  SatelliteUserMenuItems: ({
    settings,
  }: {
    settings?: { label: string; onOpen: () => void };
  }) =>
    settings ? (
      <button type="button" onClick={settings.onOpen}>
        {settings.label}
      </button>
    ) : null,
}));
vi.mock('./account-settings/default-settings-dialog', () => ({
  SatelliteDefaultSettingsDialog: ({
    centralUrl,
    defaultTab,
  }: {
    centralUrl: string;
    defaultTab?: string;
  }) => (
    <div data-testid="default-settings">
      {centralUrl}|{defaultTab ?? 'default'}
    </div>
  ),
}));
vi.mock('@tuturuuu/ui/report-problem-dialog', () => ({
  ReportProblemDialog: () => null,
}));
vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({
    children,
    onOpenChange,
    open,
  }: {
    children: ReactNode;
    onOpenChange: (open: boolean) => void;
    open: boolean;
  }) =>
    open ? (
      <div role="dialog">
        <button type="button" onClick={() => onOpenChange(false)}>
          Close
        </button>
        {children}
      </div>
    ) : null,
}));
vi.mock('./account-switcher-menu', () => ({
  SatelliteAccountSwitcherMenu: () => null,
}));
vi.mock('./app-guide-overlay', () => ({ AppGuideOverlay: () => null }));
vi.mock('./language-wrapper', () => ({ LanguageWrapper: () => null }));
vi.mock('./system-language-wrapper', () => ({
  SystemLanguageWrapper: () => null,
}));
vi.mock('./theme-dropdown-items', () => ({ ThemeDropdownItems: () => null }));
vi.mock('./workspace-selector-context', () => ({
  useWorkspaceSelector: () => null,
}));

import UserNavClient from './user-nav-client';

const user = { email: 'ada@example.com', id: 'user-1' } as never;

afterEach(cleanup);

describe('satellite UserNavClient shared settings', () => {
  it('falls back to the shared account settings dialog', () => {
    render(
      <UserNavClient locale="en" ttrUrl="https://tuturuuu.com" user={user} />,
      {
        wrapper: withNuqsTestingAdapter({
          searchParams: '?settingsTab=security',
        }),
      }
    );

    expect(screen.getByTestId('default-settings').textContent).toBe(
      'https://tuturuuu.com|security'
    );
  });

  it('opens settings from the user menu through the URL contract', async () => {
    const onUrlUpdate = vi.fn();
    render(
      <UserNavClient locale="en" ttrUrl="https://tuturuuu.com" user={user} />,
      { wrapper: withNuqsTestingAdapter({ onUrlUpdate, searchParams: '' }) }
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'common.settings' }));

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const update = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(update?.searchParams.get('settingsDialog')).toBe('open');
    expect(update?.options.history).toBe('push');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('hides the Settings menu entry when signed out', () => {
    render(<UserNavClient locale="en" user={null} />, {
      wrapper: withNuqsTestingAdapter({ searchParams: '' }),
    });
    expect(
      screen.queryByRole('button', { name: 'common.settings' })
    ).toBeNull();
  });
});
