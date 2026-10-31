import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DropdownMenuItem } from '../dropdown-menu';
import type { NavLink } from './navigation';
import { SatelliteFooterActions } from './satellite-footer-actions';
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
    expect(screen.getByText('Account settings')).toBeTruthy();
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
