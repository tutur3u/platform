import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSession: vi.fn(),
  notificationPopover: vi.fn(),
}));

vi.mock('../auth', () => ({
  getSatelliteAppSession: mocks.getSatelliteAppSession,
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('../i18n/routing', () => ({
  defaultLocale: 'en',
  supportedLocales: ['en', 'vi'],
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

vi.mock('./notification-popover', () => ({
  default: ({ userId }: { userId?: string }) => {
    mocks.notificationPopover(userId);
    return <div data-testid="notification-popover">{userId}</div>;
  },
}));

vi.mock('@tuturuuu/ui/custom/get-started-button', () => ({
  GetStartedButton: () => <div>get-started</div>,
}));

vi.mock('@tuturuuu/ui/custom/language-wrapper', () => ({
  LanguageWrapper: () => <div>language</div>,
}));

vi.mock('@tuturuuu/ui/custom/theme-toggle', () => ({
  ThemeToggle: () => <div>theme</div>,
}));

import { createNavbarActions } from './create-navbar-actions';

function UserNav() {
  return <div>user-nav</div>;
}

describe('createNavbarActions', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.getSatelliteAppSession.mockResolvedValue(null);
  });

  it('uses the workspace layout actor without re-resolving the session', async () => {
    const NavbarActions = createNavbarActions(UserNav);
    render(await NavbarActions({ userId: 'workspace-actor' }));

    expect(screen.getByText('user-nav')).toBeTruthy();
    expect(screen.getByTestId('notification-popover').textContent).toBe(
      'workspace-actor'
    );
    expect(mocks.getSatelliteAppSession).not.toHaveBeenCalled();
  });

  it('keeps the unauthenticated navigation fallback', async () => {
    const NavbarActions = createNavbarActions(UserNav);
    render(await NavbarActions({}));

    expect(screen.getByText('get-started')).toBeTruthy();
    expect(screen.queryByTestId('notification-popover')).toBeNull();
  });
});
