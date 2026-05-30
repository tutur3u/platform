import '@testing-library/jest-dom/vitest';
import { fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsDialogHost } from '../../app/[locale]/settings-dialog-host';
import UserNavClient from '../../app/[locale]/user-nav-client';
import { useSettingsDialogShortcut } from './use-settings-dialog-shortcut';

const { setSettingsQueryMock } = vi.hoisted(() => ({
  setSettingsQueryMock: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
}));

vi.mock('nuqs', () => ({
  parseAsString: {},
  parseAsStringLiteral: () => ({}),
  useQueryStates: () => [
    {
      settingsDialog: null,
      settingsLinkedProvider: null,
      settingsTab: null,
    },
    setSettingsQueryMock,
  ],
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null }),
}));

vi.mock('@tuturuuu/satellite/command-launcher', () => ({
  GlobalCommandLauncher: () => null,
  openGlobalCommandLauncher: vi.fn(),
}));

vi.mock('@tuturuuu/ui/avatar', () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AvatarImage: () => null,
}));

vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    onSelect,
  }: {
    children: ReactNode;
    onClick?: () => void;
    onSelect?: () => void;
  }) => (
    <button
      onClick={() => {
        onClick?.();
        onSelect?.();
      }}
      type="button"
    >
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuPortal: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => null,
  DropdownMenuShortcut: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
  DropdownMenuSub: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@tuturuuu/utils/hooks/use-platform', () => ({
  usePlatform: () => ({ isMac: false, modKey: 'Ctrl', modKeyAlt: 'Alt' }),
}));

vi.mock('@/components/account-switcher', () => ({
  AccountSwitcherModal: () => null,
}));

vi.mock('@/components/command/platform-extra-sections', () => ({
  PlatformCommandExtraSections: () => null,
}));

vi.mock('@/components/command/utils/use-navigation-data', () => ({
  flattenNavigation: () => [],
}));

vi.mock('@/components/settings/settings-dialog', () => ({
  SettingsDialog: () => <div data-testid="settings-dialog" />,
}));

vi.mock('@/context/account-switcher-context', () => ({
  useAccountSwitcher: () => ({ accounts: [] }),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../app/[locale]/(dashboard)/_components/language-wrapper', () => ({
  LanguageWrapper: () => null,
}));

vi.mock(
  '../../app/[locale]/(dashboard)/_components/logout-dropdown-item',
  () => ({
    LogoutDropdownItem: () => null,
  })
);

vi.mock(
  '../../app/[locale]/(dashboard)/_components/system-language-wrapper',
  () => ({
    SystemLanguageWrapper: () => null,
  })
);

vi.mock(
  '../../app/[locale]/(dashboard)/_components/theme-dropdown-items',
  () => ({
    ThemeDropdownItems: () => null,
  })
);

vi.mock('../../app/[locale]/dashboard-menu-item', () => ({
  default: () => null,
}));

vi.mock('../../app/[locale]/invite-members-menu-item', () => ({
  default: () => null,
}));

vi.mock('../../app/[locale]/meet-together-menu-item', () => ({
  default: () => null,
}));

vi.mock('../../app/[locale]/report-problem-menu-item', () => ({
  default: () => null,
}));

vi.mock('../../app/[locale]/rewise-menu-item', () => ({
  default: () => null,
}));

vi.mock('../../app/[locale]/user-presence-indicator', () => ({
  default: () => null,
}));

const user = {
  avatar_url: null,
  display_name: 'Ada',
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  handle: 'ada',
  id: 'user-1',
  new_email: null,
};

function ShortcutHarness({
  enabled = true,
  onOpen,
}: {
  enabled?: boolean;
  onOpen: () => void;
}) {
  useSettingsDialogShortcut({ enabled, onOpen });

  return <input aria-label="Editable field" />;
}

function expectSettingsQueryOpened() {
  expect(setSettingsQueryMock).toHaveBeenCalledWith(
    {
      settingsDialog: 'open',
      settingsLinkedProvider: null,
      settingsTab: null,
    },
    {
      history: 'replace',
      scroll: false,
      shallow: true,
    }
  );
}

describe('settings dialog shortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens Settings with Cmd/Ctrl + comma', () => {
    const onOpen = vi.fn();
    render(<ShortcutHarness onOpen={onOpen} />);

    fireEvent.keyDown(window, { ctrlKey: true, key: ',' });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('ignores editable targets and already-prevented events', () => {
    const onOpen = vi.fn();
    const { getByLabelText } = render(<ShortcutHarness onOpen={onOpen} />);

    fireEvent.keyDown(getByLabelText('Editable field'), {
      ctrlKey: true,
      key: ',',
    });

    const preventedEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: ',',
    });
    preventedEvent.preventDefault();
    window.dispatchEvent(preventedEvent);

    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens the query-backed dashboard settings host', () => {
    render(
      <SettingsDialogHost
        user={user as any}
        workspace={null}
        wsId="workspace-1"
      />
    );

    fireEvent.keyDown(window, { ctrlKey: true, key: ',' });

    expectSettingsQueryOpened();
  });

  it('opens the query-backed user nav settings dialog', () => {
    render(<UserNavClient locale="en" user={user as any} />);

    fireEvent.keyDown(window, { ctrlKey: true, key: ',' });

    expectSettingsQueryOpened();
  });
});
