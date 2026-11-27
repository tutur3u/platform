import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BoardTaskPageFrame } from './board-task-page-frame';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('./task-board-loading-state', () => ({
  TaskBoardLoadingState: () => <div role="status">Loading tasks</div>,
}));

describe('BoardTaskPageFrame', () => {
  it('offers to clear filters only after the last page is exhausted', () => {
    const clear = vi.fn();
    render(
      <BoardTaskPageFrame emptyKanban onClearFilters={clear} paging={null}>
        No tasks yet
      </BoardTaskPageFrame>
    );
    expect(screen.queryByText('No tasks yet')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('no_matching_tasks');
    fireEvent.click(screen.getByRole('button', { name: 'clear_filters' }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it('continues past cursor pages whose tasks all fail the visible filter', async () => {
    const pages = [
      [{ name: 'Filtered task', priority: 'low' }],
      [{ name: 'Visible task', priority: 'high' }],
    ];
    const load = vi.fn();

    function Board() {
      const [page, setPage] = useState(0);
      const visibleTasks = pages
        .slice(0, page + 1)
        .flat()
        .filter((task) => task.priority === 'high');
      return (
        <BoardTaskPageFrame
          emptyKanban={visibleTasks.length === 0}
          paging={
            page === 0
              ? {
                  hasMore: true,
                  nextCursor: 'next',
                  failed: false,
                  pending: false,
                  loadMore: () => {
                    load();
                    setPage(1);
                  },
                }
              : null
          }
        >
          {visibleTasks[0]?.name ?? 'No tasks yet'}
        </BoardTaskPageFrame>
      );
    }

    render(<Board />);
    expect(await screen.findByText('Visible task')).toBeTruthy();
    expect(screen.queryByText('No tasks yet')).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('bounds automatic requests and leaves manual paging available', async () => {
    const load = vi.fn();
    const clear = vi.fn();

    function Board() {
      const [page, setPage] = useState(0);
      return (
        <BoardTaskPageFrame
          emptyKanban
          onClearFilters={clear}
          paging={{
            hasMore: true,
            nextCursor: String(page),
            failed: false,
            pending: false,
            loadMore: () => {
              load();
              setPage(page + 1);
            },
          }}
        >
          No tasks yet
        </BoardTaskPageFrame>
      );
    }

    render(<Board />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('No tasks yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'clear_filters' }));
    expect(clear).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'load_more' }));
    expect(load).toHaveBeenCalledTimes(4);
  });
});
