import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { SETTINGS_DIALOG_OPEN_INTENT_EVENT } from '@tuturuuu/ui/hooks/settings-dialog-url';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const logoutMocks = vi.hoisted(() => ({
  push: vi.fn(),
  centralLogout: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: logoutMocks.push }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/internal-api/auth', () => ({
  logoutCurrentWebAccountWithInternalApi: logoutMocks.centralLogout,
}));
vi.mock('@tuturuuu/ui/custom/satellite-user-menu', () => ({
  SatelliteUserMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('@tuturuuu/ui/custom/satellite-user-menu-items', () => ({
  SatelliteUserMenuItems: ({
    settings,
    onLogout,
  }: {
    settings?: { label: string; onOpen: () => void };
    onLogout?: () => void;
  }) => (
    <>
      <button type="button" onClick={onLogout}>
        Log out
      </button>
      {settings ? (
        <button type="button" onClick={settings.onOpen}>
          {settings.label}
        </button>
      ) : null}
    </>
  ),
}));
vi.mock('./account-settings/default-settings-dialog', () => ({
  SatelliteDefaultSettingsDialog: ({
    centralUrl,
    defaultTab,
    onCloseAutoFocus,
  }: {
    centralUrl: string;
    defaultTab?: string;
    onCloseAutoFocus?: (event: Event) => void;
  }) => (
    <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
      <DialogTitle>Settings</DialogTitle>
      <DialogDescription>Account settings</DialogDescription>
      <div data-testid="default-settings">
        {centralUrl}|{defaultTab ?? 'default'}
      </div>
    </DialogContent>
  ),
}));
vi.mock('@tuturuuu/ui/report-problem-dialog', () => ({
  ReportProblemDialog: () => null,
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

import UserNavClient, { SatelliteSettingsDialogHost } from './user-nav-client';

const user = { email: 'ada@example.com', id: 'user-1' } as never;

afterEach(cleanup);

describe('satellite UserNavClient shared settings', () => {
  it('navigates to confirmation before calling any logout endpoint', () => {
    vi.stubGlobal('fetch', logoutMocks.fetch);
    try {
      render(
        <UserNavClient locale="vi" ttrUrl="https://tuturuuu.com" user={user} />,
        {
          wrapper: withNuqsTestingAdapter({ searchParams: '' }),
        }
      );
      fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
      const href = logoutMocks.push.mock.calls.at(-1)?.[0];
      const confirmation = new URL(href);
      expect(confirmation.origin).toBe('https://tuturuuu.com');
      expect(confirmation.pathname).toBe('/vi/logout');
      expect(confirmation.searchParams.get('appUrl')).toBe(
        window.location.origin
      );
      expect(logoutMocks.centralLogout).not.toHaveBeenCalled();
      expect(logoutMocks.fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
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

  it('keeps app-owned settings open across menu unmount and returns focus on close', async () => {
    function SidebarWithSettings() {
      const [showMenu, setShowMenu] = useState(true);
      return (
        <>
          <SatelliteSettingsDialogHost
            centralUrl="https://tuturuuu.com"
            user={user}
          />
          {showMenu && (
            <UserNavClient externalSettingsHost locale="en" user={user} />
          )}
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent(SETTINGS_DIALOG_OPEN_INTENT_EVENT, {
                  cancelable: true,
                  detail: { settingsTab: 'sidebar' },
                })
              )
            }
          >
            Open sidebar settings
          </button>
          <button type="button" onClick={() => setShowMenu(false)}>
            Hide account menu
          </button>
        </>
      );
    }

    const onUrlUpdate = vi.fn();
    render(<SidebarWithSettings />, {
      wrapper: withNuqsTestingAdapter({
        hasMemory: true,
        onUrlUpdate,
        searchParams: '',
      }),
    });

    const opener = screen.getByRole('button', {
      name: 'Open sidebar settings',
    });
    const hideMenu = screen.getByRole('button', { name: 'Hide account menu' });
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(hideMenu);
    expect(screen.getByTestId('default-settings').textContent).toBe(
      'https://tuturuuu.com|sidebar'
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'common.settings' })
    ).toBeNull();
  });
});
