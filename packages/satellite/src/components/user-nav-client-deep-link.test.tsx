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
  SatelliteUserMenu: () => null,
}));
vi.mock('@tuturuuu/ui/custom/satellite-user-menu-items', () => ({
  SatelliteUserMenuItems: () => null,
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

function TabProbe({ defaultTab }: { defaultTab?: string }) {
  return <div data-testid="settings-tab">{defaultTab ?? 'default'}</div>;
}

const user = { email: 'ada@example.com', id: 'user-1' } as never;

afterEach(cleanup);

describe('satellite UserNavClient settings deep links', () => {
  it('opens the settings dialog from a bare ?settingsTab link', () => {
    render(
      <UserNavClient locale="en" settingsDialog={<TabProbe />} user={user} />,
      {
        wrapper: withNuqsTestingAdapter({
          searchParams: '?settingsTab=security',
        }),
      }
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByTestId('settings-tab').textContent).toBe('security');
  });

  it('stays closed without settings params and clears them on close', async () => {
    const onUrlUpdate = vi.fn();
    const { unmount } = render(
      <UserNavClient locale="en" settingsDialog={<TabProbe />} user={user} />,
      { wrapper: withNuqsTestingAdapter({ searchParams: '?view=list' }) }
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();

    render(
      <UserNavClient locale="en" settingsDialog={<TabProbe />} user={user} />,
      {
        wrapper: withNuqsTestingAdapter({
          onUrlUpdate,
          searchParams: '?view=list&settingsDialog=open&settingsTab=appearance',
        }),
      }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const update = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(update?.queryString).toBe('?view=list');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
