import type { ComponentProps, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { AccountHubState } from './sidebar-footer-context';
import { SatelliteUserMenuItems } from './satellite-user-menu-items';

const hub = vi.hoisted(() => ({
  state: null as Partial<AccountHubState> | null,
}));

vi.mock('./sidebar-footer-context', () => ({
  useAccountHub: () =>
    hub.state
      ? {
          state: { unreadCount: 0, notificationsOpen: false, ...hub.state },
          patch: vi.fn(),
          anchorRef: { current: null },
        }
      : null,
}));

beforeEach(() => {
  hub.state = null;
});

vi.mock('@tuturuuu/ui/dropdown-menu', () => {
  const Container = ({ children }: { children: ReactNode }) => <>{children}</>;
  return Object.fromEntries(
    [
      'DropdownMenuGroup',
      'DropdownMenuItem',
      'DropdownMenuPortal',
      'DropdownMenuSeparator',
      'DropdownMenuShortcut',
      'DropdownMenuSub',
      'DropdownMenuSubContent',
      'DropdownMenuSubTrigger',
    ].map((key) => [key, Container])
  );
});
const props: ComponentProps<typeof SatelliteUserMenuItems> = {
  t: (key) => key,
  languageItems: null,
  themeItems: null,
  accountItems: null,
  signedIn: true,
  onReport: vi.fn(),
  onLogout: vi.fn(),
};
it('renders a labelled public profile link separately from private account settings', () => {
  const html = renderToStaticMarkup(
    <SatelliteUserMenuItems
      {...props}
      publicProfile={{
        href: 'https://tuturuuu.com/u/creator',
        label: 'Public profile',
      }}
    />
  );
  expect(html).toContain('href="https://tuturuuu.com/u/creator"');
  expect(html).toContain('Public profile');
  expect(html).toContain('rel="noopener noreferrer"');
});
it('has no Dashboard link to the central app', () => {
  const html = renderToStaticMarkup(<SatelliteUserMenuItems {...props} />);
  expect(html).not.toContain('common.dashboard');
  expect(html).not.toContain('href="https://tuturuuu.com"');
});
it('lists Notifications directly below the fallback Feedback entry', () => {
  hub.state = {
    unreadCount: 5,
    notifications: { label: 'Notifications', unreadText: '{count} unread' },
  };
  const html = renderToStaticMarkup(<SatelliteUserMenuItems {...props} />);
  const order = ['common.theme', 'common.report-problem', 'Notifications'];
  const positions = order.map((label) => html.indexOf(label));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  expect(html.indexOf('common.logout')).toBeGreaterThan(positions[2]!);
});
it('lists Notifications directly below the account hub Feedback entry', () => {
  hub.state = {
    feedback: { label: 'Feedback', open: vi.fn() },
    discord: { href: 'https://discord.gg/example' },
    notifications: { label: 'Notifications', unreadText: '{count} unread' },
  };
  const html = renderToStaticMarkup(<SatelliteUserMenuItems {...props} />);
  expect(html).not.toContain('common.report-problem');
  const feedback = html.indexOf('Feedback');
  const notifications = html.indexOf('Notifications');
  const discord = html.indexOf('Discord');
  expect(feedback).toBeGreaterThan(html.indexOf('common.theme'));
  expect(notifications).toBeGreaterThan(feedback);
  expect(discord).toBeGreaterThan(notifications);
});
it('does not invent a profile link for users without a username', () => {
  const html = renderToStaticMarkup(<SatelliteUserMenuItems {...props} />);
  expect(html).not.toContain('/u/');
});
it('does not expose a profile link in a signed-out menu even if an adapter supplies one', () => {
  const html = renderToStaticMarkup(
    <SatelliteUserMenuItems
      {...props}
      signedIn={false}
      publicProfile={{
        href: 'https://tuturuuu.com/u/creator',
        label: 'Public profile',
      }}
    />
  );
  expect(html).not.toContain('/u/creator');
});
it('offers a Settings entry for signed-in users that opens the settings dialog', () => {
  const html = renderToStaticMarkup(
    <SatelliteUserMenuItems
      {...props}
      settings={{ label: 'Settings', onOpen: vi.fn(), shortcut: '⌘,' }}
    />
  );
  expect(html).toContain('Settings');
  expect(html).toContain('⌘,');
});
it('hides the Settings entry in a signed-out menu', () => {
  const html = renderToStaticMarkup(
    <SatelliteUserMenuItems
      {...props}
      signedIn={false}
      settings={{ label: 'Settings', onOpen: vi.fn() }}
    />
  );
  expect(html).not.toContain('Settings');
});
