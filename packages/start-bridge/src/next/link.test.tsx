// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({
  navigate: vi.fn(),
  options: { defaultPreload: 'intent' as string | false },
  preloadRoute: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({ useRouter: () => router }));

const { default: Link } = await import('./link');

describe('bridge Link intent preloading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    router.options.defaultPreload = 'intent';
    router.preloadRoute.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('preloads the destination after a short hover', () => {
    render(<Link href="/ws/boards">Boards</Link>);
    fireEvent.mouseEnter(screen.getByText('Boards'));
    expect(router.preloadRoute).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(router.preloadRoute).toHaveBeenCalledWith({ href: '/ws/boards' });
  });

  it('does not preload when the pointer leaves first', () => {
    render(<Link href="/ws/boards">Boards</Link>);
    const link = screen.getByText('Boards');
    fireEvent.mouseEnter(link);
    fireEvent.mouseLeave(link);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(router.preloadRoute).not.toHaveBeenCalled();
  });

  it('does not preload a link tabbed past quickly', () => {
    render(<Link href="/ws/boards">Boards</Link>);
    const link = screen.getByText('Boards');
    fireEvent.focus(link);
    fireEvent.blur(link);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(router.preloadRoute).not.toHaveBeenCalled();
  });

  it('drops a pending preload when the destination or prefetch changes', () => {
    const { rerender } = render(<Link href="/ws/a">Board</Link>);
    fireEvent.mouseEnter(screen.getByText('Board'));
    rerender(<Link href="/ws/b">Board</Link>);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseEnter(screen.getByText('Board'));
    rerender(
      <Link href="/ws/b" prefetch={false}>
        Board
      </Link>
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(router.preloadRoute).not.toHaveBeenCalled();
  });

  it('preloads immediately on touch', () => {
    render(<Link href="/ws/calendar">Calendar</Link>);
    fireEvent.touchStart(screen.getByText('Calendar'));
    expect(router.preloadRoute).toHaveBeenCalledWith({ href: '/ws/calendar' });
  });

  it('respects prefetch={false}, external targets and routers without intent', () => {
    router.options.defaultPreload = false;
    render(
      <>
        <Link href="/a">Router off</Link>
        <Link href="/b" prefetch={false}>
          Prefetch off
        </Link>
        <Link href="/c" target="_blank">
          New tab
        </Link>
        <Link href="//cdn.example/x">Protocol relative</Link>
      </>
    );
    for (const text of ['Router off', 'Prefetch off', 'New tab']) {
      fireEvent.touchStart(screen.getByText(text));
    }
    router.options.defaultPreload = 'intent';
    fireEvent.touchStart(screen.getByText('Prefetch off'));
    fireEvent.touchStart(screen.getByText('New tab'));
    fireEvent.touchStart(screen.getByText('Protocol relative'));
    expect(router.preloadRoute).not.toHaveBeenCalled();
  });

  it('keeps the caller hover handlers', () => {
    const onMouseEnter = vi.fn();
    render(
      <Link href="/ws/goals" onMouseEnter={onMouseEnter}>
        Goals
      </Link>
    );
    fireEvent.mouseEnter(screen.getByText('Goals'));
    expect(onMouseEnter).toHaveBeenCalledTimes(1);
  });
});
