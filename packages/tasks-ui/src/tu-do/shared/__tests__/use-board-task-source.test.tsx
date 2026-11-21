import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
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
  page: vi.fn(),
  pagination: {} as Record<string, ListPaginationState>,
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTasks: mocks.page,
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
  view = 'kanban',
  personal = false,
  tasks = [shown],
}: {
  filters: Partial<TaskFilters>;
  view?: 'kanban' | 'list';
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
        currentView: view,
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
    mocks.page.mockResolvedValue({ tasks: [shown, other], nextCursor: null });
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
    expect(mocks.page).toHaveBeenCalledTimes(1);
    expect(mocks.page.mock.calls[0]?.[1]).not.toHaveProperty('q');
    expect(mocks.counts).not.toHaveBeenCalled();

    // A new search and a sort need no request.
    rerender({ filters: { searchQuery: 'other', sortBy: 'priority-high' } });
    await waitFor(() =>
      expect(result.current.sourceTasks.map((t) => t.id)).toEqual(['task-2'])
    );
    expect(mocks.page).toHaveBeenCalledTimes(1);
  });

  it('loads 50 of 1,000 tasks initially and fetches another page on demand', async () => {
    const fixture = Array.from({ length: 1_000 }, (_, index) =>
      task(`task-${index}`, 'list-1', `Task ${index}`)
    );
    mocks.page
      .mockResolvedValueOnce({
        tasks: fixture.slice(0, 50),
        nextCursor: 'next',
      })
      .mockResolvedValueOnce({
        tasks: fixture.slice(50, 100),
        nextCursor: 'more',
      });
    const { result } = renderSource({ filters: {}, tasks: [], view: 'list' });
    await waitFor(() => expect(result.current.sourceTasks).toHaveLength(50));
    expect(mocks.page).toHaveBeenCalledTimes(1);
    expect(mocks.page).toHaveBeenLastCalledWith(
      'ws-1',
      expect.objectContaining({ cursor: 'start' })
    );

    act(() => result.current.pagination?.loadMore());
    await waitFor(() => expect(result.current.sourceTasks).toHaveLength(100));
    expect(mocks.page).toHaveBeenCalledTimes(2);
    expect(mocks.page).toHaveBeenLastCalledWith(
      'ws-1',
      expect.objectContaining({ cursor: 'next' })
    );
  });

  it('steps over continuation pages that filter to no tasks', async () => {
    mocks.page
      .mockResolvedValueOnce({ tasks: [], nextCursor: 'placed~start' })
      .mockResolvedValueOnce({ tasks: [], nextCursor: 'assigned~start' })
      .mockResolvedValueOnce({ tasks: [shown], nextCursor: null });
    const { result } = renderSource({ filters: {}, tasks: [], view: 'list' });

    await waitFor(() => expect(result.current.sourceTasks).toEqual([shown]));
    expect(mocks.page.mock.calls.map(([, options]) => options.cursor)).toEqual([
      'start',
      'placed~start',
      'assigned~start',
    ]);
    expect(result.current.pagination).toBeNull();
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

  it('finds a task through a retained board key even when the loaded board shows its current key', async () => {
    const renamedBoardTask = {
      ...shown,
      display_number: 12,
      ticket_prefix: 'F',
    };
    mocks.pagination = { 'list-1': loaded, 'list-2': loaded };
    mocks.copy.mockResolvedValue([renamedBoardTask]);
    mocks.counts.mockResolvedValue([{ count: 1, list_id: 'list-1' }]);
    const { result } = renderSource({
      filters: { searchQuery: 'OLD-12' },
      tasks: [renamedBoardTask, other],
    });

    await waitFor(() =>
      expect(result.current.sourceTasks).toEqual([renamedBoardTask])
    );
    expect(mocks.copy).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({ boardId: 'board-1', limit: 200, q: 'OLD-12' })
    );
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it('pages an explicit source scope through the server in 200-row requests', async () => {
    mocks.copy.mockResolvedValue([shown]);
    mocks.counts.mockResolvedValue([{ count: 1, list_id: 'list-1' }]);
    const { result } = renderSource({
      filters: { sourceScope: 'external_current_workspace' },
      view: 'list',
    });

    await waitFor(() => expect(result.current.sourceTasks).toEqual([shown]));
    expect(mocks.copy).toHaveBeenCalledWith(
      'ws-1',
      expect.objectContaining({
        boardId: 'board-1',
        limit: 200,
        sourceScope: 'external_current_workspace',
      })
    );
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it('loads the copy while a personal board has external pages to go', async () => {
    const stagingId = getPersonalExternalStagingListId('board-1');
    const external = task('external-1', stagingId, 'External timeline');
    mocks.pagination = {
      'list-1': loaded,
      'list-2': loaded,
      [stagingId]: { ...loaded, hasMore: true },
    };
    mocks.page.mockResolvedValue({
      tasks: [shown, external],
      nextCursor: null,
    });
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
