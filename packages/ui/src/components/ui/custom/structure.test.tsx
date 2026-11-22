import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '../dialog';
import { Popover } from '../popover';
import { Structure } from './structure';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Structure', () => {
  it('server-renders the passed width and does not correct it or inject a script', () => {
    const markup = renderToString(
      <Structure
        isCollapsed={false}
        setIsCollapsed={vi.fn()}
        sidebarExpandedWidth="22rem"
      >
        <span>Page content</span>
      </Structure>
    );
    expect(markup).toContain('--sidebar-expanded-width:22rem');
    expect(markup).not.toContain('<script');

    const { container } = render(
      <Structure
        isCollapsed={false}
        setIsCollapsed={vi.fn()}
        sidebarExpandedWidth="22rem"
      >
        <span>Page content</span>
      </Structure>
    );
    const aside = container.querySelector('aside');
    const painted = aside?.getAttribute('style');
    expect(painted).toContain('--sidebar-expanded-width: 22rem');

    act(() => {});

    expect(aside?.getAttribute('style')).toBe(painted);
    expect(container.querySelector('script')).toBeNull();
  });

  it('removes sidebar chrome and desktop padding when the sidebar is hidden', () => {
    const { container } = render(
      <Structure
        isCollapsed
        setIsCollapsed={vi.fn()}
        mobileHeader={<span>Mobile header</span>}
        sidebarContent={<span>Sidebar content</span>}
        sidebarHeader={<span>Sidebar header</span>}
        sidebarHidden
      >
        <span>Page content</span>
      </Structure>
    );

    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(screen.queryByText('Mobile header')).not.toBeInTheDocument();
    expect(screen.queryByText('Sidebar header')).not.toBeInTheDocument();
    expect(screen.queryByText('Sidebar content')).not.toBeInTheDocument();
    expect(container.querySelector('aside')).not.toBeInTheDocument();
    expect(container.querySelector('nav')).not.toBeInTheDocument();
    expect(container.querySelector('main')).toHaveClass('md:pl-0');
    expect(screen.getByText('Page content').parentElement).toHaveClass(
      'p-2',
      'md:p-4'
    );
  });

  it('clears the measured mobile top bar, including the top safe area', () => {
    const { container } = render(
      <Structure
        isCollapsed
        setIsCollapsed={vi.fn()}
        mobileHeader={<span>Mobile header</span>}
        sidebarContent={<span>Sidebar content</span>}
        sidebarHeader={<span>Sidebar header</span>}
      >
        <span>Page content</span>
      </Structure>
    );

    const nav = container.querySelector('[data-slot="mobile-top-bar"]');
    expect(nav).toHaveClass('safe-top');
    expect(
      container
        .querySelector('main')
        ?.style.getPropertyValue('--mobile-nav-height')
    ).toMatch(/px$/);
    expect(screen.getByText('Page content').parentElement).toHaveClass(
      'pt-[calc(var(--mobile-nav-height,calc(3.5rem+env(safe-area-inset-top,0px)))+0.75rem)]'
    );
  });

  it('keeps the account and notification controls in the collapsed footer', () => {
    const { container } = render(
      <Structure
        actions={<span>Expanded account actions</span>}
        isCollapsed
        notificationPopover={<button type="button">Notifications</button>}
        setIsCollapsed={vi.fn()}
        userPopover={<button type="button">Account</button>}
      >
        <span>Page content</span>
      </Structure>
    );

    const sidebar = container.querySelector('aside');
    expect(sidebar).not.toBeNull();
    const sidebarQueries = within(sidebar as HTMLElement);

    expect(
      sidebarQueries.getByRole('button', { name: 'Account' })
    ).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Account' })).toHaveLength(1);
    expect(
      sidebarQueries.getByRole('button', { name: 'Notifications' })
    ).toBeVisible();
    expect(
      sidebarQueries.queryByText('Expanded account actions')
    ).not.toBeInTheDocument();
  });

  it('mounts the compact account in the top bar only on a phone', () => {
    vi.stubGlobal('innerWidth', 390);
    const { container } = render(
      <Structure
        isCollapsed
        setIsCollapsed={vi.fn()}
        mobileSidebarOpen={false}
        userPopover={<button type="button">Account</button>}
      >
        <span>Page content</span>
      </Structure>
    );

    const account = screen.getByRole('button', { name: 'Account' });
    expect(account.closest('nav')).toBe(
      container.querySelector('[data-slot="mobile-top-bar"]')
    );
  });

  it('renders the combined account actions only once when expanded', () => {
    const { container } = render(
      <Structure
        actions={<span>Expanded account actions</span>}
        isCollapsed={false}
        notificationPopover={<button type="button">Notifications</button>}
        setIsCollapsed={vi.fn()}
        userPopover={<button type="button">Account</button>}
      >
        <span>Page content</span>
      </Structure>
    );

    const sidebar = container.querySelector('aside');
    expect(sidebar).not.toBeNull();
    const sidebarQueries = within(sidebar as HTMLElement);

    expect(sidebarQueries.getByText('Expanded account actions')).toBeVisible();
    expect(
      sidebarQueries.queryByRole('button', { name: 'Notifications' })
    ).not.toBeInTheDocument();
    expect(
      sidebarQueries.queryByRole('button', { name: 'Account' })
    ).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'puts Settings and the footer actions on one row (collapsed: %s)',
    (isCollapsed) => {
      const { container } = render(
        <Structure
          feedbackButton={
            <button aria-label="Feedback" type="button">
              !
            </button>
          }
          isCollapsed={isCollapsed}
          setIsCollapsed={vi.fn()}
          sidebarUtility={<button type="button">Settings</button>}
        >
          <span>Page content</span>
        </Structure>
      );

      const rows = container.querySelectorAll(
        '[data-slot="sidebar-utility-row"]'
      );
      expect(rows).toHaveLength(1);
      const row = within(rows[0] as HTMLElement);
      expect(row.getByRole('button', { name: 'Settings' })).toBeVisible();
      expect(row.getByRole('button', { name: 'Feedback' })).toBeVisible();
      expect(rows[0]).toHaveClass(isCollapsed ? 'flex-col' : 'items-center');
    }
  );

  describe('hover overlay', () => {
    const mounts = vi.fn();
    function MountProbe() {
      useEffect(() => {
        mounts();
      }, []);
      return <span>Probe</span>;
    }
    const renderStructure = (
      isCollapsed: boolean,
      overlayOnExpand: boolean
    ) => (
      <Structure
        isCollapsed={isCollapsed}
        overlayOnExpand={overlayOnExpand}
        setIsCollapsed={vi.fn()}
        sidebarContent={<MountProbe />}
      >
        <span>Page content</span>
      </Structure>
    );

    beforeEach(() => mounts.mockClear());

    it('reserves a constant rail and never transitions in-flow padding or width', () => {
      const { container, rerender } = render(renderStructure(true, true));
      const main = container.querySelector('main') as HTMLElement;
      const aside = container.querySelector('aside') as HTMLElement;

      for (const collapsed of [true, false]) {
        rerender(renderStructure(collapsed, true));
        expect(main).toHaveClass('md:pl-[var(--sidebar-collapsed-width)]');
        expect(main).not.toHaveClass('md:pl-[var(--sidebar-expanded-width)]');
        expect(main.className).not.toContain('transition');
        expect(aside.className).not.toContain('transition-all');
      }
      expect(aside).toHaveClass('md:z-40');
      // The panel fades in as its own surface; the aside never wipes or slides.
      expect(aside.className).not.toMatch(/sidebar-overlay-(reveal|conceal)/);
      const surface = aside.querySelector('[data-sidebar-overlay-surface]');
      expect(surface).toHaveClass(
        'sidebar-overlay-content',
        'md:bg-background',
        'md:border-r'
      );
      expect(aside).toHaveClass('md:bg-transparent', 'md:border-r-0');
    });

    it('keeps an inert underlay slot for the rail beneath the fading panel', () => {
      const { container } = render(renderStructure(false, true));
      const underlay = container.querySelector(
        '[data-slot="sidebar-rail-underlay"]'
      ) as HTMLElement;
      expect(underlay).toHaveAttribute('aria-hidden', 'true');
      expect(underlay).toHaveAttribute('inert');
      expect(underlay).toHaveClass(
        'pointer-events-none',
        'w-[var(--sidebar-collapsed-width)]',
        'md:empty:hidden'
      );
    });

    it('remounts the sidebar body between rail and panel so no element is repositioned', () => {
      const { rerender } = render(renderStructure(true, true));
      expect(mounts).toHaveBeenCalledTimes(1);
      rerender(renderStructure(false, true));
      expect(mounts).toHaveBeenCalledTimes(2);
      rerender(renderStructure(true, true));
      expect(mounts).toHaveBeenCalledTimes(3);
    });

    const renderHoverStructure = (
      isCollapsed: boolean,
      handlers: { onMouseEnter?: () => void; onMouseLeave?: () => void }
    ) => (
      <Structure
        isCollapsed={isCollapsed}
        overlayOnExpand
        setIsCollapsed={vi.fn()}
        sidebarContent={<span>Nav</span>}
        {...handlers}
      >
        <span>Page content</span>
      </Structure>
    );

    it('animates the expanded overlay closed before collapsing', () => {
      const onMouseLeave = vi.fn();
      const { container } = render(
        renderHoverStructure(false, { onMouseLeave })
      );
      const aside = container.querySelector('aside') as HTMLElement;

      fireEvent.mouseLeave(aside);
      expect(onMouseLeave).not.toHaveBeenCalled();
      expect(aside).toHaveAttribute('data-overlay-state', 'closing');

      const content = aside.querySelector(
        '.sidebar-overlay-content-out'
      ) as HTMLElement;
      expect(content).toHaveAttribute('data-sidebar-overlay-surface');
      // A nested animation ending does not close the panel early.
      fireEvent.animationEnd(content.firstElementChild as HTMLElement);
      expect(onMouseLeave).not.toHaveBeenCalled();

      fireEvent.animationEnd(content, {
        animationName: 'sidebar-overlay-fade-out',
      });
      expect(onMouseLeave).toHaveBeenCalledTimes(1);
      expect(aside).toHaveAttribute('data-overlay-state', 'open');
    });

    it('cancels the close when the pointer comes back', () => {
      const onMouseEnter = vi.fn();
      const onMouseLeave = vi.fn();
      const { container } = render(
        renderHoverStructure(false, { onMouseEnter, onMouseLeave })
      );
      const aside = container.querySelector('aside') as HTMLElement;

      fireEvent.mouseLeave(aside);
      fireEvent.mouseEnter(aside);
      fireEvent.animationEnd(
        aside.querySelector('[data-sidebar-overlay-surface]') as HTMLElement,
        { animationName: 'sidebar-overlay-fade-out' }
      );

      expect(onMouseEnter).toHaveBeenCalledTimes(1);
      expect(onMouseLeave).not.toHaveBeenCalled();
      expect(aside).toHaveAttribute('data-overlay-state', 'open');
    });

    it('collapses at once when reduced motion is preferred', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({
          addEventListener: vi.fn(),
          matches: query.includes('prefers-reduced-motion'),
          removeEventListener: vi.fn(),
        }))
      );
      const onMouseLeave = vi.fn();
      const { container } = render(
        renderHoverStructure(false, { onMouseLeave })
      );

      fireEvent.mouseLeave(container.querySelector('aside') as HTMLElement);
      expect(onMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('closes even if the animation never reports its end', () => {
      vi.useFakeTimers();
      try {
        const onMouseLeave = vi.fn();
        const { container } = render(
          renderHoverStructure(false, { onMouseLeave })
        );

        fireEvent.mouseLeave(container.querySelector('aside') as HTMLElement);
        act(() => {
          vi.advanceTimersByTime(300);
        });
        expect(onMouseLeave).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('waits for the last overlay and cancels a deferred close on re-entry', () => {
      const onMouseLeave = vi.fn();
      const renderOverlays = (popoverOpen: boolean, dialogOpen: boolean) => (
        <Structure
          isCollapsed={false}
          onMouseLeave={onMouseLeave}
          overlayOnExpand
          setIsCollapsed={vi.fn()}
          sidebarContent={
            <>
              <Popover open={popoverOpen} />
              <Dialog open={dialogOpen} />
            </>
          }
        >
          <span>Page content</span>
        </Structure>
      );
      const { rerender } = render(renderOverlays(true, true));
      const sidebar = screen.getByRole('complementary');
      fireEvent.mouseLeave(sidebar);
      rerender(renderOverlays(false, true));
      expect(sidebar).toHaveAttribute('data-overlay-state', 'open');

      fireEvent.mouseEnter(sidebar);
      rerender(renderOverlays(false, false));
      expect(sidebar).toHaveAttribute('data-overlay-state', 'open');
      expect(onMouseLeave).not.toHaveBeenCalled();

      fireEvent.mouseLeave(sidebar);
      expect(sidebar).toHaveAttribute('data-overlay-state', 'closing');
      fireEvent.animationEnd(sidebar);
      expect(onMouseLeave).toHaveBeenCalledTimes(1);
    });

    it('keeps the animated reflow and mounted body for non-overlay sidebars', () => {
      const { container, rerender } = render(renderStructure(true, false));
      rerender(renderStructure(false, false));

      expect(mounts).toHaveBeenCalledTimes(1);
      expect(container.querySelector('aside')).toHaveClass('transition-all');
      expect(
        container.querySelector('[data-sidebar-overlay-surface]')
      ).toBeNull();
      expect(
        container.querySelector('[data-slot="sidebar-rail-underlay"]')
      ).toBeNull();
      expect(container.querySelector('main')).toHaveClass('transition-all');
    });
  });
});
