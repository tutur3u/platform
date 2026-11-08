import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { getPersonalExternalStagingListId } from '@tuturuuu/utils/task-helper';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskFilters } from '../../boards/boardId/task-filter';
import { DEFAULT_BOARD_FILTERS } from '../board-header/board-filter-state';
import type { ListPaginationState } from '../progressive-loader-context';
import { useBoardTaskSource } from '../use-board-task-source';

const mocks = vi.hoisted(() => ({
  counts: vi.fn(),
  copy: vi.fn(),
  pagination: {} as Record<string, ListPaginationState>,
}));

vi.mock('../board-task-search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../board-task-search')>()),
  listBoardTaskCountsForSearch: mocks.counts,
  listBoardTasksForSearch: mocks.copy,
}));

vi.mock('../progressive-loader-context', () => ({
  useProgressiveLoader: () => ({ pagination: mocks.pagination }),
}));

const loaded: ListPaginationState = {
  hasMore: false,
  isInitialLoad: false,
  isLoading: false,
  page: 0,
  totalCount: 1,
};
const list = (id: string) => ({ id, name: id }) as TaskList;
const task = (id: string, listId: string, name: string) =>
  ({ id, list_id: listId, name, priority: 'normal' }) as Task;

const shown = task('task-1', 'list-1', 'Ship timeline revamp');
const other = task('task-2', 'list-2', 'Other work');

function renderSource({
  filters,
  personal = false,
  tasks = [shown],
}: {
  filters: Partial<TaskFilters>;
  personal?: boolean;
  tasks?: Task[];
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(
    (props: { filters: Partial<TaskFilters> }) =>
      useBoardTaskSource({
        autoCollapseEmptyTaskLists: false,
        board: { id: 'board-1', ticket_prefix: null },
        currentView: 'kanban',
        effectiveWorkspaceId: 'ws-1',
        filters: { ...DEFAULT_BOARD_FILTERS, ...props.filters },
        listStatusFilter: 'all',
        lists: [list('list-1'), list('list-2')],
        localTaskState: false,
        personal,
        tasks,
        unprioritizedPosition: 'last',
      }),
    { initialProps: { filters }, wrapper }
  );
}

describe('useBoardTaskSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pagination = {};
  });

  it('filters one unfiltered copy of the board in the browser', async () => {
    mocks.copy.mockResolvedValue([shown, other]);
    const { result, rerender } = renderSource({
      filters: { searchQuery: 'TIMELINE' },
    });

    // Lists without a match hide, counted from the copy.
    await waitFor(() =>
      expect(result.current.listCounts).toEqual([
        { count: 1, list_id: 'list-1' },
      ])
    );
    expect(result.current.sourceTasks.map((t) => t.id)).toEqual(['task-1']);
    expect(mocks.copy).toHaveBeenCalledTimes(1);
    expect(mocks.copy.mock.calls[0]?.[1]).not.toHaveProperty('q');
    expect(mocks.counts).not.toHaveBeenCalled();

    // A new search and a sort need no request.
    rerender({ filters: { searchQuery: 'other', sortBy: 'priority-high' } });
    await waitFor(() =>
      expect(result.current.sourceTasks.map((t) => t.id)).toEqual(['task-2'])
    );
    expect(mocks.copy).toHaveBeenCalledTimes(1);
  });

  it('searches the loaded board cache without a request', async () => {
    mocks.pagination = { 'list-1': loaded, 'list-2': loaded };
    const { result } = renderSource({
      filters: { searchQuery: 'other' },
      tasks: [shown, other],
    });

    expect(result.current.sourceTasks.map((t) => t.id)).toEqual(['task-2']);
    expect(result.current.pagesCovered).toBe(false);
    expect(mocks.copy).not.toHaveBeenCalled();
  });

  it('loads the copy while a personal board has external pages to go', async () => {
    const stagingId = getPersonalExternalStagingListId('board-1');
    const external = task('external-1', stagingId, 'External timeline');
    mocks.pagination = {
      'list-1': loaded,
      'list-2': loaded,
      [stagingId]: { ...loaded, hasMore: true },
    };
    mocks.copy.mockResolvedValue([shown, external]);
    const { result } = renderSource({
      filters: { searchQuery: 'timeline' },
      personal: true,
    });

    await waitFor(() =>
      expect(result.current.sourceTasks.map((t) => t.id).sort()).toEqual([
        'external-1',
        'task-1',
      ])
    );
    expect(result.current.pagesCovered).toBe(true);
  });
});
