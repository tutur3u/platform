import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '../dialog';
import { FOCUS_MODALITY_ATTRIBUTE } from './focus-modality';
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

const setModality = (modality: 'keyboard' | 'pointer' | null) => {
  if (modality) {
    document.documentElement.setAttribute(FOCUS_MODALITY_ATTRIBUTE, modality);
  } else {
    document.documentElement.removeAttribute(FOCUS_MODALITY_ATTRIBUTE);
  }
};

/** A shell that owns the collapse state, as every real shell does. */
function MinimalShell({
  dialogOpen = false,
  onOpen,
  onClose,
}: {
  dialogOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  return (
    <Structure
      actions={<button type="button">Account</button>}
      isCollapsed={isCollapsed}
      minimalLogo={<span>Logo</span>}
      mobileHeader={<span>Mobile header</span>}
      onMouseEnter={() => {
        onOpen?.();
        setIsCollapsed(false);
      }}
      onMouseLeave={() => {
        onClose?.();
        setIsCollapsed(true);
      }}
      overlayOnExpand
      setIsCollapsed={setIsCollapsed}
      sidebarContent={
        <>
          <a href="/tasks">Tasks</a>
          <button type="button">Search</button>
          <Dialog open={dialogOpen} />
        </>
      }
      sidebarHeader={<a href="/home">Brand</a>}
      sidebarLabels={{ open: 'Open sidebar', close: 'Close sidebar' }}
      sidebarMinimal
    >
      <button type="button">Page action</button>
    </Structure>
  );
}

const sidebar = () => screen.getByRole('complementary');
const trigger = () =>
  sidebar().querySelector('[data-sidebar-reveal-trigger]') as HTMLElement;
const isOpen = () => sidebar().getAttribute('data-overlay-state') === 'open';
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
/** Runs the close delay, then reports the end of the conceal animation. */
const finishClosing = () => {
  advance(240);
  const surface = sidebar().querySelector('[data-sidebar-overlay-surface]');
  if (surface) fireEvent.animationEnd(surface);
};
const focusByKeyboard = (element: HTMLElement) => {
  setModality('keyboard');
  act(() => element.focus());
};

beforeEach(() => {
  stubMatchMedia();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setModality(null);
});

describe('Structure in minimal mode', () => {
  it('rests as the logo alone, with the page clear of it', () => {
    const { container } = render(<MinimalShell />);

    expect(trigger()).toHaveAccessibleName('Open sidebar');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveTextContent('Logo');
    expect(screen.queryByText('Tasks')).not.toBeInTheDocument();
    expect(screen.queryByText('Brand')).not.toBeInTheDocument();
    expect(screen.queryByText('Account')).not.toBeInTheDocument();
    expect(sidebar().querySelectorAll('button')).toHaveLength(1);
    // No rail chrome on desktop, and a gutter that keeps content off the logo.
    expect(sidebar().className).not.toMatch(/(^|\s)(border-l|md:border-r)/);
    expect(sidebar()).not.toHaveClass('backdrop-blur-lg');
    expect(sidebar()).not.toHaveClass('bg-background/50');
    expect(container.querySelector('main')).toHaveClass(
      'md:pl-[var(--sidebar-minimal-gutter)]'
    );
    // Phones keep their top bar and drawer.
    expect(screen.getByText('Mobile header')).toBeInTheDocument();
  });

  it('opens on hover only once the pointer rests', () => {
    const onOpen = vi.fn();
    render(<MinimalShell onOpen={onOpen} />);

    fireEvent.mouseEnter(sidebar());
    advance(100);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.mouseLeave(sidebar());
    advance(500);
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.mouseEnter(sidebar());
    advance(120);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(isOpen()).toBe(true);
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute(
      'aria-controls',
      sidebar().querySelector('[data-sidebar-overlay-surface]')?.id
    );
  });

  it('floats the open panel and animates it as its own surface', () => {
    render(<MinimalShell />);
    fireEvent.mouseEnter(sidebar());
    advance(120);

    const surface = sidebar().querySelector(
      '[data-sidebar-overlay-surface]'
    ) as HTMLElement;
    expect(surface).toHaveClass(
      'sidebar-minimal-reveal',
      'md:rounded-2xl',
      'md:border',
      'md:shadow-xl'
    );
    expect(sidebar()).not.toHaveClass('sidebar-overlay-reveal');
    expect(sidebar()).toHaveClass(
      'md:z-40',
      'md:w-[calc(var(--sidebar-expanded-width)+1rem)]'
    );
  });

  it('waits before closing and stays open when the pointer returns', () => {
    const onClose = vi.fn();
    render(<MinimalShell onClose={onClose} />);
    fireEvent.mouseEnter(sidebar());
    advance(120);

    fireEvent.mouseLeave(sidebar());
    advance(200);
    expect(sidebar()).toHaveAttribute('data-overlay-state', 'open');
    fireEvent.mouseEnter(sidebar());
    advance(1000);
    expect(onClose).not.toHaveBeenCalled();
    expect(isOpen()).toBe(true);

    fireEvent.mouseLeave(sidebar());
    advance(240);
    expect(sidebar()).toHaveAttribute('data-overlay-state', 'closing');
    expect(
      sidebar().querySelector('[data-sidebar-overlay-surface]')
    ).toHaveClass('sidebar-minimal-conceal');
    finishClosing();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Tasks')).not.toBeInTheDocument();
  });

  it('closes without an animation when reduced motion is preferred', () => {
    stubMatchMedia(true);
    const onClose = vi.fn();
    render(<MinimalShell onClose={onClose} />);
    fireEvent.mouseEnter(sidebar());
    advance(120);

    fireEvent.mouseLeave(sidebar());
    advance(240);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Tasks')).not.toBeInTheDocument();
  });

  it('opens at once on keyboard focus and leaves focus on the logo', () => {
    render(<MinimalShell />);

    focusByKeyboard(trigger());

    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(trigger());
    expect(
      sidebar().querySelector('[data-sidebar-overlay-surface]')?.className
    ).toContain(
      'group-has-[[data-sidebar-reveal-trigger]:focus-visible:not([data-focus-modality=pointer]_*)]:ring-2'
    );
  });

  it('does not open when a click or tap focuses the logo', () => {
    render(<MinimalShell />);

    setModality('pointer');
    act(() => trigger().focus());

    expect(isOpen()).toBe(false);
  });

  it('keeps Tab inside the open panel', () => {
    render(<MinimalShell />);
    focusByKeyboard(trigger());
    const account = screen.getByRole('button', { name: 'Account' });

    act(() => account.focus());
    fireEvent.keyDown(account, { key: 'Tab' });
    expect(document.activeElement).toBe(trigger());

    fireEvent.keyDown(trigger(), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(account);

    // Tab between two controls inside is left to the browser.
    const search = screen.getByRole('button', { name: 'Search' });
    act(() => search.focus());
    expect(fireEvent.keyDown(search, { key: 'Tab' })).toBe(true);
    expect(document.activeElement).toBe(search);
  });

  it('closes on Escape and returns focus to the logo without reopening', () => {
    const onOpen = vi.fn();
    render(<MinimalShell onOpen={onOpen} />);
    focusByKeyboard(trigger());
    act(() => screen.getByRole('link', { name: 'Tasks' }).focus());

    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger());
    expect(sidebar()).toHaveAttribute('data-overlay-state', 'closing');
    expect(
      sidebar().querySelector('[data-sidebar-overlay-surface]')
    ).toHaveAttribute('inert');
    expect(fireEvent.keyDown(trigger(), { key: 'Tab', shiftKey: true })).toBe(
      true
    );
    expect(document.activeElement).toBe(trigger());
    finishClosing();

    expect(isOpen()).toBe(false);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(onOpen).toHaveBeenCalledTimes(1);
    advance(1000);
    expect(isOpen()).toBe(false);
  });

  it('closes when keyboard focus leaves for the page', () => {
    render(<MinimalShell />);
    focusByKeyboard(trigger());

    act(() => screen.getByRole('button', { name: 'Page action' }).focus());
    finishClosing();

    expect(isOpen()).toBe(false);
  });

  it('leaves Escape to a dialog opened from the sidebar', () => {
    const onClose = vi.fn();
    const { rerender } = render(<MinimalShell onClose={onClose} />);
    focusByKeyboard(trigger());
    rerender(<MinimalShell dialogOpen onClose={onClose} />);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.pointerDown(document.body);
    finishClosing();

    expect(onClose).not.toHaveBeenCalled();
    expect(isOpen()).toBe(true);
  });

  it('opens on a tap and closes on a press outside', () => {
    const onOpen = vi.fn();
    render(<MinimalShell onOpen={onOpen} />);

    // A tap reports a hover first; it must not also open on a timer.
    const touch = new Event('pointerenter');
    Object.defineProperty(touch, 'pointerType', { value: 'touch' });
    act(() => {
      sidebar().dispatchEvent(touch);
    });
    fireEvent.mouseEnter(sidebar());
    setModality('pointer');
    fireEvent.click(trigger());
    expect(isOpen()).toBe(true);
    advance(500);
    expect(onOpen).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(screen.getByRole('link', { name: 'Tasks' }));
    expect(sidebar()).toHaveAttribute('data-overlay-state', 'open');

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Page action' }));
    expect(sidebar()).toHaveAttribute('data-overlay-state', 'closing');
    finishClosing();
    expect(isOpen()).toBe(false);
  });

  it('closes after a tapped destination but not under a hovering pointer', () => {
    render(<MinimalShell />);
    fireEvent.click(trigger());
    const tasks = screen.getByRole('link', { name: 'Tasks' });
    tasks.addEventListener('click', (event) => event.preventDefault());

    fireEvent.click(tasks);
    expect(sidebar()).toHaveAttribute('data-overlay-state', 'closing');
    finishClosing();
    expect(isOpen()).toBe(false);

    fireEvent.mouseEnter(sidebar());
    advance(120);
    const hovered = screen.getByRole('link', { name: 'Tasks' });
    hovered.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(hovered);
    advance(1000);
    expect(isOpen()).toBe(true);
  });

  it('toggles from the logo by keyboard', () => {
    render(<MinimalShell />);
    focusByKeyboard(trigger());

    fireEvent.click(trigger());
    finishClosing();
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());

    fireEvent.click(trigger());
    expect(isOpen()).toBe(true);
    expect(trigger()).toHaveAccessibleName('Close sidebar');
  });
});
