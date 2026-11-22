import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Structure } from './structure';

const stubMatchMedia = (reducedMotion = false) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      matches: reducedMotion && query.includes('prefers-reduced-motion'),
      removeEventListener: vi.fn(),
    }))
  );

beforeEach(() => stubMatchMedia());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Expand-on-hover shell; rail and panel render different content. */
function HoverShell({ hover = true }: { hover?: boolean }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  return (
    <Structure
      isCollapsed={isCollapsed}
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => setIsCollapsed(true)}
      overlayOnExpand={hover}
      setIsCollapsed={setIsCollapsed}
      sidebarContent={
        isCollapsed ? (
          <nav className="overflow-y-auto" data-testid="rail-nav" id="nav">
            <svg aria-hidden="true">
              <defs>
                <linearGradient id="rail-gradient" />
              </defs>
            </svg>
            Rail icons
          </nav>
        ) : (
          <nav data-testid="panel-nav">Panel labels</nav>
        )
      }
    >
      <span>Page content</span>
    </Structure>
  );
}

const aside = () => screen.getByRole('complementary');
const underlay = () =>
  aside().querySelector('[data-slot="sidebar-rail-underlay"]') as HTMLElement;
const surface = () =>
  aside().querySelector('[data-sidebar-overlay-surface]') as HTMLElement;

describe('expand-on-hover rail underlay', () => {
  it('shows a static copy of the rail under the panel while it fades in', () => {
    render(<HoverShell />);
    expect(underlay()).toBeEmptyDOMElement();

    fireEvent.mouseEnter(aside());
    expect(screen.getByTestId('panel-nav')).toBeInTheDocument();
    expect(underlay()).toHaveTextContent('Rail icons');
    // The copy is not interactive and does not duplicate the live ids.
    expect(underlay().querySelector('#nav')).toBeNull();
    expect(underlay()).toHaveAttribute('inert');

    // A nested animation ending does not remove it; the surface's does.
    fireEvent.animationEnd(screen.getByTestId('panel-nav'));
    expect(underlay()).toHaveTextContent('Rail icons');
    fireEvent.animationEnd(surface(), {
      animationName: 'sidebar-overlay-fade-in',
    });
    expect(underlay()).toBeEmptyDOMElement();
  });

  it('removes the copy on a timeout when no animation end arrives', () => {
    vi.useFakeTimers();
    render(<HoverShell />);
    fireEvent.mouseEnter(aside());
    expect(underlay()).not.toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(underlay()).toBeEmptyDOMElement();
  });

  it('puts the rail back under the panel while it fades out', () => {
    render(<HoverShell />);
    fireEvent.mouseEnter(aside());
    fireEvent.animationEnd(surface(), {
      animationName: 'sidebar-overlay-fade-in',
    });

    fireEvent.mouseLeave(aside());
    expect(aside()).toHaveAttribute('data-overlay-state', 'closing');
    expect(underlay()).toHaveTextContent('Rail icons');

    fireEvent.animationEnd(surface(), {
      animationName: 'sidebar-overlay-fade-out',
    });
    expect(aside()).not.toHaveAttribute('data-overlay-state');
    expect(screen.getByTestId('rail-nav')).toBeInTheDocument();
    expect(underlay()).toBeEmptyDOMElement();
  });

  it('keeps SVG ids and the rail scroll offset in the copy', () => {
    // jsdom has no layout, so scroll offsets are stored per element here.
    const offsets = new WeakMap<Element, number>();
    const descriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollTop'
    );
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get(this: Element) {
        return offsets.get(this) ?? 0;
      },
      set(this: Element, value: number) {
        offsets.set(this, value);
      },
    });
    try {
      render(<HoverShell />);
      screen.getByTestId('rail-nav').scrollTop = 40;
      fireEvent.mouseEnter(aside());

      expect(underlay().querySelector('#rail-gradient')).not.toBeNull();
      const copy = underlay().querySelector(
        '[data-testid="rail-nav"]'
      ) as HTMLElement;
      expect(copy.scrollTop).toBe(40);
    } finally {
      if (descriptor) {
        Object.defineProperty(Element.prototype, 'scrollTop', descriptor);
      }
    }
  });

  it('clears the copy when a pointer returns during the fade-out', () => {
    render(<HoverShell />);
    fireEvent.mouseEnter(aside());
    fireEvent.animationEnd(surface(), {
      animationName: 'sidebar-overlay-fade-in',
    });
    fireEvent.mouseLeave(aside());
    expect(underlay()).toHaveTextContent('Rail icons');

    fireEvent.mouseEnter(aside());
    expect(aside()).toHaveAttribute('data-overlay-state', 'open');
    expect(surface()).toHaveClass('sidebar-overlay-content');
    fireEvent.animationEnd(surface(), {
      animationName: 'sidebar-overlay-fade-in',
    });
    expect(underlay()).toBeEmptyDOMElement();
  });

  it('adds no copy on phones, where the drawer replaces the rail', () => {
    const width = window.innerWidth;
    window.innerWidth = 500;
    try {
      render(<HoverShell />);
      fireEvent.mouseEnter(aside());
      expect(underlay()).toBeEmptyDOMElement();
    } finally {
      window.innerWidth = width;
    }
  });

  it('has no underlay outside expand-on-hover', () => {
    render(<HoverShell hover={false} />);
    expect(underlay()).toBeNull();
  });

  it('adds no copy when reduced motion is preferred', () => {
    stubMatchMedia(true);
    render(<HoverShell />);
    fireEvent.mouseEnter(aside());
    expect(screen.getByTestId('panel-nav')).toBeInTheDocument();
    expect(underlay()).toBeEmptyDOMElement();
  });
});
