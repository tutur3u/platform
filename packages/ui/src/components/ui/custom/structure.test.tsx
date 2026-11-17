import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(
      sidebarQueries.getByRole('button', { name: 'Notifications' })
    ).toBeVisible();
    expect(
      sidebarQueries.queryByText('Expanded account actions')
    ).not.toBeInTheDocument();
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
      expect(aside).toHaveClass('sidebar-overlay-reveal', 'md:z-40');
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
      expect(aside).toHaveClass('sidebar-overlay-conceal');
      expect(aside).not.toHaveClass('sidebar-overlay-reveal');

      const content = aside.querySelector(
        '.sidebar-overlay-content-out'
      ) as HTMLElement;
      fireEvent.animationEnd(content);
      expect(onMouseLeave).not.toHaveBeenCalled();

      fireEvent.animationEnd(aside, {
        animationName: 'sidebar-overlay-conceal',
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
      fireEvent.animationEnd(aside, {
        animationName: 'sidebar-overlay-conceal',
      });

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

    it('keeps the animated reflow and mounted body for non-overlay sidebars', () => {
      const { container, rerender } = render(renderStructure(true, false));
      rerender(renderStructure(false, false));

      expect(mounts).toHaveBeenCalledTimes(1);
      expect(container.querySelector('aside')).toHaveClass('transition-all');
      expect(container.querySelector('aside')).not.toHaveClass(
        'sidebar-overlay-reveal'
      );
      expect(container.querySelector('main')).toHaveClass('transition-all');
    });
  });
});
