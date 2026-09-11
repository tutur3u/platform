import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VirtualizedTaskList } from './task-list';
import { TaskListLoadMore } from './task-list-load-more';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

vi.mock('@dnd-kit/core', () => ({
  useDndMonitor: vi.fn(),
  useDroppable: () => ({ setNodeRef: vi.fn() }),
}));
vi.mock('./task', () => ({ MeasuredTaskCard: () => null }));

describe('task list pagination recovery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lets keyboard and pointer users load tasks without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const onLoadMore = vi.fn();
    render(<TaskListLoadMore onLoadMore={onLoadMore} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'load_more' }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it('announces loading and prevents duplicate clicks', () => {
    const onLoadMore = vi.fn();
    render(<TaskListLoadMore onLoadMore={onLoadMore} isLoading />);
    const button = screen.getByRole('button', { name: 'loading_more_tasks' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onLoadMore).not.toHaveBeenCalled();
  });
  it('keeps pagination reachable when no currently loaded tasks are visible', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const onLoadMore = vi.fn();
    render(
      <VirtualizedTaskList
        tasks={[]}
        column={{ id: 'list-1' } as TaskList}
        boardId="board-1"
        onUpdate={vi.fn()}
        hasMore
        onLoadMore={onLoadMore}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'load_more' }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });
  it('automatically preloads near the column viewport, once per page', () => {
    const observers: {
      notify: (visible: boolean) => void;
      disconnect: ReturnType<typeof vi.fn>;
      root: Element | Document | null | undefined;
      margin: string | undefined;
    }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect = vi.fn();
        observe = vi.fn();
        constructor(
          callback: IntersectionObserverCallback,
          options?: IntersectionObserverInit
        ) {
          observers.push({
            notify: (visible) =>
              callback(
                [{ isIntersecting: visible } as IntersectionObserverEntry],
                this as unknown as IntersectionObserver
              ),
            disconnect: this.disconnect,
            root: options?.root,
            margin: options?.rootMargin,
          });
        }
      }
    );
    const onLoadMore = vi.fn();
    const props = {
      tasks: [],
      column: { id: 'list-1' } as TaskList,
      boardId: 'board-1',
      onUpdate: vi.fn(),
      hasMore: true,
      onLoadMore,
    };
    const { container, rerender, unmount } = render(
      <VirtualizedTaskList {...props} />
    );
    expect(observers).toHaveLength(2);
    expect(observers[0]?.root).toBe(container.firstElementChild);
    expect(observers[0]?.margin).toBe('200px 0px');
    // Vertical proximity alone must not fetch a horizontally hidden column.
    act(() => observers[0]?.notify(true));
    expect(onLoadMore).not.toHaveBeenCalled();
    act(() => observers[0]?.notify(false));
    act(() => observers[1]?.notify(true));
    expect(onLoadMore).not.toHaveBeenCalled();
    act(() => {
      observers[0]?.notify(true);
      observers[0]?.notify(true);
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(observers[0]?.disconnect).toHaveBeenCalled();

    rerender(<VirtualizedTaskList {...props} isLoadingMore />);
    expect(observers).toHaveLength(2);
    act(() => observers[0]?.notify(true));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    // A short column can still fit another page: re-observe after loading.
    rerender(<VirtualizedTaskList {...props} isLoadingMore={false} />);
    expect(observers).toHaveLength(4);
    act(() => observers[2]?.notify(true));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    act(() => observers[3]?.notify(true));
    expect(onLoadMore).toHaveBeenCalledTimes(2);
    rerender(<VirtualizedTaskList {...props} hasMore={false} />);
    expect(
      screen.queryByRole('button', { name: 'load_more' })
    ).not.toBeInTheDocument();
    expect(observers[2]?.disconnect).toHaveBeenCalled();
    expect(observers[3]?.disconnect).toHaveBeenCalled();
    unmount();
    act(() => observers[2]?.notify(true));
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });
});
