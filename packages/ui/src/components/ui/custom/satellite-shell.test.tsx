import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useEffect, useMemo } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DropdownMenuItem } from '../dropdown-menu';
import type { NavLink } from './navigation';
import { AccountHubActionItems } from './account-hub-ui';
import { SatelliteFooterActions } from './satellite-footer-actions';
import {
  AccountHubProvider,
  useAccountHub,
  usePublishAccountHub,
} from './sidebar-footer-context';
import { SidebarNavigation } from './satellite-navigation';
import { SatelliteShell } from './satellite-shell';
import { SatelliteUserMenu } from './satellite-user-menu';
import { Structure } from './structure';
import { useSatelliteShell } from './use-satellite-shell';

const emptyLinks: NavLink[] = [];
let mobile = false;
let notifyResize = () => {};
beforeEach(() => {
  mobile = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn((media: string) => ({
      matches: mobile,
      media,
      onchange: null,
      addEventListener: (_event: string, listener: () => void) => {
        notifyResize = listener;
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
    // On desktop the footer is the stacked icon column, not the combined row.
    expect(screen.getByText('Avatar')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Apps' })[0]!);
    expect(openApps).toHaveBeenCalledOnce();
  });

  it('releases the mobile body scroll lock when resized to desktop', () => {
    mobile = true;
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('scrollY', 120);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const props = {
      isCollapsed: false,
      setIsCollapsed: vi.fn(),
      children: 'Page content',
    };
    const { rerender } = render(
      <Structure {...props} mobileSidebarOpen={false} />
    );
    expect(document.body.style.position).toBe('');
    rerender(<Structure {...props} mobileSidebarOpen />);
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-120px');
    expect(document.body.style.width).toBe('100%');
    act(() => {
      mobile = false;
      vi.stubGlobal('innerWidth', 768);
      notifyResize();
    });
    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.width).toBe('');
    expect(scrollTo).toHaveBeenCalledWith(0, 120);
    vi.restoreAllMocks();
  });

  it.each([false, true])(
    'starts mobile closed with desktop collapsed=%s',
    (defaultCollapsed) => {
      mobile = true;
      const persistCollapsed = vi.fn();
      const handleBehaviorChange = vi.fn();
      const { result } = renderHook(() =>
        useSatelliteShell({
          pathname: '/',
          links: emptyLinks,
          backLabel: 'Back',
          defaultCollapsed,
          behavior: defaultCollapsed ? 'collapsed' : 'expanded',
          persistCollapsed,
          handleBehaviorChange,
        })
      );
      expect(result.current.isCollapsed).toBe(true);
      expect(result.current.mobileSidebarOpen).toBe(false);
      act(() => result.current.handleToggle());
      expect(result.current.isCollapsed).toBe(false);
      act(() => result.current.handleToggle());
      expect(result.current.isCollapsed).toBe(true);
      expect(persistCollapsed).not.toHaveBeenCalled();
      expect(handleBehaviorChange).not.toHaveBeenCalled();
      act(() => {
        mobile = false;
        notifyResize();
      });
      expect(result.current.isCollapsed).toBe(defaultCollapsed);
    }
  );

  it.each(['expanded', 'collapsed'] as const)(
    'retains desktop %s and persists toggles',
    (behavior) => {
      const persistCollapsed = vi.fn();
      const handleBehaviorChange = vi.fn();
      const { result } = renderHook(() =>
        useSatelliteShell({
          pathname: '/',
          links: emptyLinks,
          backLabel: 'Back',
          behavior,
          persistCollapsed,
          handleBehaviorChange,
        })
      );
      expect(result.current.isCollapsed).toBe(behavior === 'collapsed');
      act(() => result.current.handleToggle());
      expect(persistCollapsed).toHaveBeenCalledWith(behavior === 'expanded');
      expect(handleBehaviorChange).toHaveBeenCalledWith(
        behavior === 'expanded' ? 'collapsed' : 'expanded'
      );
    }
  );

  it('server-renders mobile closed while retaining the desktop expanded layout', () => {
    function ServerShell() {
      const shell = useSatelliteShell({
        pathname: '/',
        links: emptyLinks,
        backLabel: 'Back',
        behavior: 'expanded',
      });
      return (
        <SatelliteShell
          isCollapsed={shell.isCollapsed}
          mobileSidebarOpen={shell.mobileSidebarOpen}
          setIsCollapsed={shell.handleToggle}
          brand={{
            appName: 'Mail',
            appHref: '/',
            centralHref: '/',
            logo: null,
            launcherLabel: 'Apps',
            onAppClick: () => {},
          }}
          homeLabel="Home"
          sidebarLabels={{ open: 'Open menu', close: 'Close menu' }}
        >
          Page content
        </SatelliteShell>
      );
    }
    const markup = renderToString(<ServerShell />);
    const document = new DOMParser().parseFromString(markup, 'text/html');
    expect(
      document.querySelector('aside')?.classList.contains('max-md:hidden')
    ).toBe(true);
    expect(
      document
        .querySelector('main')
        ?.classList.contains('md:pl-[var(--sidebar-expanded-width)]')
    ).toBe(true);
    expect(document.querySelector('button.fixed.inset-0')).toBeNull();
    mobile = true;
    vi.stubGlobal('innerWidth', 390);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { container } = render(<ServerShell />);
    expect(container.querySelector('aside')).toHaveClass('max-md:hidden');
    expect(window.document.body.style.position).toBe('');
    fireEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', {
        name: 'Open menu',
      })
    );
    expect(container.querySelector('aside')).not.toHaveClass('max-md:hidden');
    expect(window.document.body.style.position).toBe('fixed');
    fireEvent.click(container.querySelector('button.fixed.inset-0')!);
    expect(container.querySelector('aside')).toHaveClass('max-md:hidden');
    expect(window.document.body.style.position).toBe('');
    vi.restoreAllMocks();
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

  it('server-renders a collapsed desktop rail when behavior stays expanded', () => {
    function ServerShell() {
      const shell = useSatelliteShell({
        pathname: '/',
        links: emptyLinks,
        backLabel: 'Back',
        behavior: 'expanded',
        defaultCollapsed: true,
      });
      return <div data-collapsed={String(shell.isCollapsed)} />;
    }

    expect(renderToString(<ServerShell />)).toContain('data-collapsed="true"');

    const paints: boolean[] = [];
    function Probe() {
      const shell = useSatelliteShell({
        pathname: '/',
        links: emptyLinks,
        backLabel: 'Back',
        behavior: 'expanded',
        defaultCollapsed: true,
      });
      paints.push(shell.isCollapsed);
      return null;
    }

    render(<Probe />);
    expect(paints[0]).toBe(true);
    expect(paints.every((collapsed) => collapsed)).toBe(true);
  });

  it('applies a later desktop behavior change after the first paint', () => {
    const paints: boolean[] = [];
    function Probe({ behavior }: { behavior: 'expanded' | 'collapsed' }) {
      const shell = useSatelliteShell({
        pathname: '/',
        links: emptyLinks,
        backLabel: 'Back',
        behavior,
        defaultCollapsed: false,
      });
      paints.push(shell.isCollapsed);
      return null;
    }

    const { rerender } = render(<Probe behavior="expanded" />);
    expect(paints.every((collapsed) => collapsed === false)).toBe(true);
    rerender(<Probe behavior="collapsed" />);
    expect(paints.at(-1)).toBe(true);
  });

  it('keeps the expanded footer mounted until Settings closes', () => {
    const { result, rerender } = renderHook(
      ({
        behavior,
        settingsOpen,
      }: {
        behavior: 'expanded' | 'minimal';
        settingsOpen: boolean;
      }) =>
        useSatelliteShell({
          pathname: '/',
          links: emptyLinks,
          backLabel: 'Back',
          behavior,
          holdBehavior: settingsOpen,
        }),
      { initialProps: { behavior: 'expanded', settingsOpen: true } }
    );

    rerender({ behavior: 'minimal', settingsOpen: true });
    expect(result.current.behavior).toBe('expanded');
    expect(result.current.isCollapsed).toBe(false);

    rerender({ behavior: 'minimal', settingsOpen: false });
    expect(result.current.behavior).toBe('minimal');
    expect(result.current.isCollapsed).toBe(true);
  });

  it.each(['hover', 'minimal'] as const)(
    'rests collapsed and opens as an overlay in %s mode',
    (behavior) => {
      const handleBehaviorChange = vi.fn();
      const links: NavLink[] = [];
      const { result } = renderHook(() =>
        useSatelliteShell({
          pathname: '/',
          links,
          backLabel: 'Back',
          behavior,
          handleBehaviorChange,
        })
      );
      expect(result.current.isCollapsed).toBe(true);
      act(() => result.current.onMouseEnter?.());
      expect(result.current.isCollapsed).toBe(false);
      act(() => result.current.onMouseLeave?.());
      expect(result.current.isCollapsed).toBe(true);
      // Opening the overlay is not a change of mode.
      expect(handleBehaviorChange).not.toHaveBeenCalled();
    }
  );
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
  it('shows the unread count on the avatar and lists the hub actions in its menu', async () => {
    const feedback = vi.fn();
    function Notifications() {
      const hub = useAccountHub();
      const patch = hub?.patch;
      const labels = useMemo(
        () => ({ label: 'Notifications', unreadText: '{count} unread' }),
        []
      );
      usePublishAccountHub('notifications', labels);
      useEffect(() => patch?.({ unreadCount: 4 }), [patch]);
      return null;
    }
    render(
      <AccountHubProvider>
        <Notifications />
        <SatelliteFooterActions
          wsId="ws"
          showUpgrade
          discordHref="https://discord.gg/example"
          labels={{ upgrade: 'Upgrade', feedback: 'Feedback' }}
          onFeedback={feedback}
        />
        <SatelliteUserMenu name="Ngoc" email="ngoc@example.com" label="Account">
          <AccountHubActionItems />
        </SatelliteUserMenu>
      </AccountHubProvider>
    );
    const trigger = await screen.findByRole('button', {
      name: 'Account, 4 unread',
    });
    expect(
      trigger.querySelector('[data-slot="account-unread-badge"]')?.textContent
    ).toBe('4');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(
      screen.getByRole('menuitem', { name: /Notifications/ })
    ).toBeTruthy();
    expect(
      screen.getByRole('menuitem', { name: 'Upgrade' }).getAttribute('href')
    ).toBe('/ws/billing');
    expect(
      screen.getByRole('menuitem', { name: 'Discord' }).getAttribute('href')
    ).toBe('https://discord.gg/example');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Feedback' }));
    await waitFor(() => expect(feedback).toHaveBeenCalledOnce());
  });
  it('publishes Upgrade, Discord and Feedback to the account menu instead of rendering footer controls', () => {
    const feedback = vi.fn();
    function Probe() {
      const hub = useAccountHub();
      return (
        <output data-testid="hub">
          {JSON.stringify({
            upgrade: hub?.state.upgrade?.href,
            discord: hub?.state.discord?.href,
            feedback: hub?.state.feedback?.label,
          })}
        </output>
      );
    }
    const { container } = render(
      <AccountHubProvider>
        <SatelliteFooterActions
          wsId="ws"
          showUpgrade
          discordHref="https://discord.example/invite"
          labels={{ upgrade: 'Upgrade', feedback: 'Feedback' }}
          onFeedback={feedback}
        />
        <Probe />
      </AccountHubProvider>
    );
    expect(JSON.parse(screen.getByTestId('hub').textContent ?? '{}')).toEqual({
      upgrade: '/ws/billing',
      discord: 'https://discord.example/invite',
      feedback: 'Feedback',
    });
    expect(container.querySelector('button, a')).toBeNull();
  });
});
