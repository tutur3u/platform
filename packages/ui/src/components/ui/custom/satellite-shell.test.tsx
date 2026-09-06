import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropdownMenuItem } from '../dropdown-menu';
import type { NavLink } from './navigation';
import { SatelliteFooterActions } from './satellite-footer-actions';
import { SidebarNavigation } from './satellite-navigation';
import { SatelliteShell } from './satellite-shell';
import { SatelliteUserMenu } from './satellite-user-menu';
import { useSatelliteShell } from './use-satellite-shell';

afterEach(cleanup);

describe('framework-independent satellite shell', () => {
  it('renders native links, the app launcher, content and account slots without Next providers', () => {
    const openApps = vi.fn();
    const toggle = vi.fn();
    render(
      <SatelliteShell
        isCollapsed={false}
        setIsCollapsed={toggle}
        hideSizeToggle
        brand={{
          appName: 'Colab',
          appHref: '/',
          centralHref: 'https://tuturuuu.com',
          logo: <span>Logo</span>,
          launcherLabel: 'Apps',
          onAppClick: openApps,
        }}
        homeLabel="Home"
        sidebarLabels={{ open: 'Expand', close: 'Collapse' }}
        sidebarContent={
          <SidebarNavigation
            links={[
              { title: 'Workshop', href: '/room' },
              null,
              { title: 'Guide', href: '/guide' },
            ]}
            isCollapsed={false}
            renderLink={(link) => <a href={link.href}>{link.title}</a>}
          />
        }
        actions={<span>Account settings</span>}
        userPopover={<span>Avatar</span>}
      >
        <h1>Team workshop</h1>
      </SatelliteShell>
    );
    expect(screen.getByRole('main').textContent).toContain('Team workshop');
    expect(
      screen.getByRole('link', { name: 'Workshop' }).getAttribute('href')
    ).toBe('/room');
    expect(screen.getByText('Account settings')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Apps' })[0]!);
    expect(openApps).toHaveBeenCalledOnce();
  });

  it('preserves route-driven submenus, back navigation and collapse persistence', () => {
    const persistCollapsed = vi.fn();
    const links: NavLink[] = [
      {
        title: 'Workspace',
        children: [
          { title: 'Tasks', href: '/tasks' },
          { title: 'Calendar', href: '/calendar' },
        ],
      },
    ];
    const { result, rerender } = renderHook(
      ({ pathname }) =>
        useSatelliteShell({
          pathname,
          links,
          backLabel: 'Back',
          persistCollapsed,
        }),
      { initialProps: { pathname: '/tasks' } }
    );
    expect(result.current.navState.titleHistory).toEqual(['Workspace']);
    act(() => result.current.backButton.onClick?.());
    expect(result.current.navState.history).toEqual([]);
    act(() => result.current.handleToggle());
    expect(result.current.isCollapsed).toBe(true);
    expect(persistCollapsed).toHaveBeenCalledWith(true);
    rerender({ pathname: '/calendar' });
    expect(result.current.navState.titleHistory).toEqual(['Workspace']);
  });

  it('preserves hidden and hover behavior while respecting open dialogs', () => {
    const handleBehaviorChange = vi.fn();
    const links: NavLink[] = [];
    const { result, rerender } = renderHook(
      ({ behavior }: { behavior: 'hidden' | 'hover' }) =>
        useSatelliteShell({
          pathname: '/',
          links,
          backLabel: 'Back',
          behavior,
          handleBehaviorChange,
        }),
      { initialProps: { behavior: 'hidden' } }
    );
    expect(result.current.isCollapsed).toBe(true);
    act(() => result.current.handleToggle());
    expect(handleBehaviorChange).toHaveBeenCalledWith('collapsed');
    rerender({ behavior: 'hover' });
    act(() => result.current.onMouseEnter?.());
    expect(result.current.isCollapsed).toBe(false);
    const { unmount } = render(
      <div role="dialog" data-state="open">
        Settings
      </div>
    );
    act(() => result.current.onMouseLeave?.());
    expect(result.current.isCollapsed).toBe(false);
    unmount();
    act(() => result.current.onMouseLeave?.());
    expect(result.current.isCollapsed).toBe(true);
  });
});

describe('shared account chrome', () => {
  it('exposes the signed-in identity and adapter actions in the profile menu', () => {
    render(
      <SatelliteUserMenu
        name="Ngọc Nguyễn"
        email="ngoc@example.com"
        label="Account"
        online
      >
        <DropdownMenuItem asChild>
          <a href="/profile">My profile</a>
        </DropdownMenuItem>
      </SatelliteUserMenu>
    );
    const trigger = screen.getByRole('button', { name: 'Account' });
    expect(trigger.textContent).toContain('Ngọc Nguyễn');
    expect(trigger.textContent).toContain('ngoc@example.com');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(
      screen.getByRole('menuitem', { name: 'My profile' }).getAttribute('href')
    ).toBe('/profile');
  });
  it('keeps collapsed feedback and community actions accessible', () => {
    const feedback = vi.fn();
    render(
      <SatelliteFooterActions
        wsId=""
        isCollapsed
        showUpgrade={false}
        labels={{ upgrade: 'Upgrade', feedback: 'Feedback' }}
        discordHref="https://discord.gg/example"
        onFeedback={feedback}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
    expect(feedback).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('link', { name: 'Discord' }).getAttribute('href')
    ).toBe('https://discord.gg/example');
  });
});
