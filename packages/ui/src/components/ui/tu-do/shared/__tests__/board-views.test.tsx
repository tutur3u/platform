import '@testing-library/jest-dom';
import { formatHotkeySequence, HotkeysProvider } from '@tanstack/react-hotkeys';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { WorkspaceLabel } from '@tuturuuu/utils/task-helper';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoardConfigKey } from '../board-config-storage';
import { BoardViews } from '../board-views';

const listWorkspaceTasksMock = vi.hoisted(() => vi.fn());
const createTaskMock = vi.fn();
const loadListPageMock = vi.fn();
let progressivePagination: Record<string, unknown> = {};
let boardHeaderProps:
  | React.ComponentProps<typeof import('../board-header')['BoardHeader']>
  | undefined;
let kanbanBoardProps:
  | React.ComponentProps<
      typeof import('../../boards/boardId/kanban')['KanbanBoard']
    >
  | undefined;
let listViewProps:
  | React.ComponentProps<typeof import('../list-view')['ListView']>
  | undefined;

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/hooks/use-semantic-task-search', () => ({
  useSemanticTaskSearch: () => ({
    data: [],
    isFetching: false,
    isLoading: false,
  }),
}));

vi.mock('../../hooks/useTaskDialog', () => ({
  useTaskDialog: () => ({
    createTask: createTaskMock,
  }),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTasks: listWorkspaceTasksMock,
}));

vi.mock('../progressive-loader-context', () => ({
  useProgressiveLoader: () => ({
    loadListPage: loadListPageMock,
    revalidateLoadedLists: vi.fn().mockResolvedValue(undefined),
    pagination: progressivePagination,
  }),
}));

vi.mock('../board-header', () => ({
  BoardHeader: (props: any) => {
    boardHeaderProps = props;

    return (
      <div data-testid="board-header">
        <input data-testid="board-header-input" />
      </div>
    );
  },
}));

vi.mock('../recycle-bin-panel', () => ({
  RecycleBinPanel: () => null,
}));

vi.mock('../../boards/boardId/kanban', () => ({
  KanbanBoard: (props: any) => {
    kanbanBoardProps = props;
    return <div data-testid="kanban-view">Kanban</div>;
  },
}));

vi.mock('../list-view', () => ({
  ListView: (props: any) => {
    listViewProps = props;
    return <div data-testid="list-view">List</div>;
  },
}));

vi.mock('../../boards/boardId/timeline-board', () => ({
  TimelineBoard: () => <div data-testid="timeline-view">Timeline</div>,
}));

const mockBoard = {
  id: 'board-1',
  name: 'Roadmap',
  ticket_prefix: 'RD',
  ws_id: 'ws-1',
} as const;

const mockWorkspace = {
  id: 'ws-1',
  personal: false,
} as const;

const mockLists: TaskList[] = [
  {
    archived: false,
    board_id: 'board-1',
    color: 'BLUE',
    created_at: '2026-03-07T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'list-1',
    name: 'To Do',
    position: 0,
    status: 'not_started',
  },
  {
    archived: false,
    board_id: 'board-1',
    color: 'GREEN',
    created_at: '2026-03-07T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'list-2',
    name: 'In Progress',
    position: 1,
    status: 'active',
  },
];

const closedList: TaskList = {
  archived: false,
  board_id: 'board-1',
  color: 'PURPLE',
  created_at: '2026-03-07T00:00:00.000Z',
  creator_id: 'user-1',
  deleted: false,
  id: 'list-closed',
  name: 'Closed',
  position: 2,
  status: 'closed',
};

const mockTasks: Task[] = [
  {
    assignees: [],
    created_at: '2026-03-07T00:00:00.000Z',
    display_number: 1,
    end_date: null,
    id: 'task-1',
    labels: [],
    list_id: 'list-1',
    name: 'Ship timeline revamp',
    priority: 'normal',
    sort_key: 1,
    start_date: undefined,
  },
];

const mockWorkspaceLabels: WorkspaceLabel[] = [];

function renderBoardViews(overrides?: {
  board?: Record<string, unknown>;
  idleBottomIsland?: React.ReactNode;
  lists?: TaskList[];
  tasks?: Task[];
  workspace?: { id: string; personal: boolean };
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider>
        <BoardViews
          board={(overrides?.board ?? mockBoard) as any}
          currentUserId="user-1"
          lists={overrides?.lists ?? mockLists}
          tasks={overrides?.tasks ?? mockTasks}
          workspace={(overrides?.workspace ?? mockWorkspace) as any}
          workspaceLabels={mockWorkspaceLabels}
          idleBottomIsland={overrides?.idleBottomIsland}
        />
      </HotkeysProvider>
    </QueryClientProvider>
  );

  return {
    ...result,
    queryClient,
  };
}

describe('BoardViews', () => {
  beforeEach(() => {
    boardHeaderProps = undefined;
    kanbanBoardProps = undefined;
    listViewProps = undefined;
    createTaskMock.mockReset();
    loadListPageMock.mockReset();
    progressivePagination = {};
    listWorkspaceTasksMock.mockReset();
    listWorkspaceTasksMock.mockResolvedValue({ tasks: mockTasks });
    window.localStorage.clear();
  });

  it('registers visible hotkey labels for each board view', () => {
    renderBoardViews();

    expect(boardHeaderProps?.viewHotkeyLabels).toEqual({
      kanban: formatHotkeySequence(['G', 'K']),
      list: formatHotkeySequence(['G', 'L']),
      timeline: formatHotkeySequence(['G', 'T']),
    });
  });

  it('switches between kanban, list, and timeline using TanStack hotkey sequences', async () => {
    renderBoardViews();

    expect(screen.getByTestId('kanban-view')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'l' });

    await waitFor(() => {
      expect(screen.getByTestId('list-view')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 't' });

    await waitFor(() => {
      expect(screen.getByTestId('timeline-view')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'k' });

    await waitFor(() => {
      expect(screen.getByTestId('kanban-view')).toBeInTheDocument();
    });
  });

  it('toggles the idle bottom island around active kanban bulk selection', async () => {
    renderBoardViews({
      idleBottomIsland: <div data-testid="idle-bottom-island" />,
    });

    expect(screen.getByTestId('idle-bottom-island')).toBeInTheDocument();

    act(() => {
      kanbanBoardProps?.onBulkSelectionActiveChange?.(true);
    });

    expect(screen.queryByTestId('idle-bottom-island')).toBeNull();

    act(() => {
      kanbanBoardProps?.onBulkSelectionActiveChange?.(false);
    });

    expect(screen.getByTestId('idle-bottom-island')).toBeInTheDocument();
  });

  it('keeps the idle bottom island visible outside kanban view', async () => {
    renderBoardViews({
      idleBottomIsland: <div data-testid="idle-bottom-island" />,
    });

    act(() => {
      kanbanBoardProps?.onBulkSelectionActiveChange?.(true);
      boardHeaderProps?.onViewChange('list');
    });

    await waitFor(() => {
      expect(screen.getByTestId('list-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('idle-bottom-island')).toBeInTheDocument();

    act(() => {
      boardHeaderProps?.onViewChange('timeline');
    });

    await waitFor(() => {
      expect(screen.getByTestId('timeline-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('idle-bottom-island')).toBeInTheDocument();
  });

  it('creates a task from the first visible list with the board filters when pressing C', () => {
    renderBoardViews();

    fireEvent.keyDown(document, { key: 'c' });

    expect(createTaskMock).toHaveBeenCalledTimes(1);
    expect(createTaskMock).toHaveBeenCalledWith(
      'board-1',
      'list-1',
      mockLists,
      {
        assignees: [],
        dueDateRange: null,
        estimationRange: null,
        includeMyTasks: false,
        includeUnassigned: false,
        labels: [],
        priorities: [],
        projects: [],
        sourceBoardIds: [],
        sourceScope: 'all_visible',
        sourceWorkspaceIds: [],
      }
    );
  });

  it('creates a task in the board default list when configured', () => {
    renderBoardViews({
      board: { ...mockBoard, default_list_id: 'list-2' },
    });

    fireEvent.keyDown(document, { key: 'c' });

    expect(createTaskMock).toHaveBeenCalledTimes(1);
    expect(createTaskMock).toHaveBeenCalledWith(
      'board-1',
      'list-2',
      mockLists,
      expect.objectContaining({ labels: [] })
    );
  });

  it('falls back to the first list when the default list is unavailable', () => {
    renderBoardViews({
      board: { ...mockBoard, default_list_id: 'list-does-not-exist' },
    });

    fireEvent.keyDown(document, { key: 'c' });

    expect(createTaskMock).toHaveBeenCalledTimes(1);
    expect(createTaskMock).toHaveBeenCalledWith(
      'board-1',
      'list-1',
      mockLists,
      expect.objectContaining({ labels: [] })
    );
  });

  it('pins a collapsed virtual external task list on personal boards without assigned external tasks', () => {
    renderBoardViews({
      workspace: {
        ...mockWorkspace,
        personal: true,
      },
    });

    expect(kanbanBoardProps?.lists[0]).toEqual(
      expect.objectContaining({
        id: 'personal-external-staging:board-1',
        is_external_collapsed: true,
        is_external_staging: true,
        name: 'external_tasks',
      })
    );

    fireEvent.keyDown(document, { key: 'c' });

    expect(createTaskMock).toHaveBeenCalledTimes(1);
    expect(createTaskMock).toHaveBeenCalledWith(
      'board-1',
      'list-1',
      mockLists,
      expect.objectContaining({
        labels: [],
      })
    );
  });

  it('expands the virtual external task list by default when assigned external tasks exist', () => {
    renderBoardViews({
      workspace: {
        ...mockWorkspace,
        personal: true,
      },
      tasks: [
        ...mockTasks,
        {
          ...mockTasks[0]!,
          id: 'external-task-1',
          is_personal_external: true,
          list_id: 'personal-external-staging:board-1',
          name: 'Assigned external task',
          source_workspace_id: 'team-ws',
          source_workspace_name: 'Team',
        } as Task,
      ],
    });

    expect(kanbanBoardProps?.lists[0]).toEqual(
      expect.objectContaining({
        id: 'personal-external-staging:board-1',
        is_external_collapsed: false,
        is_external_staging: true,
      })
    );
  });

  it('persists the collapsed external task list state per personal board', async () => {
    window.localStorage.setItem(
      'personal-board-external-tasks-collapsed:board-1',
      'true'
    );

    renderBoardViews({
      workspace: {
        ...mockWorkspace,
        personal: true,
      },
    });

    await waitFor(() => {
      expect(kanbanBoardProps?.lists[0]).toEqual(
        expect.objectContaining({
          id: 'personal-external-staging:board-1',
          is_external_collapsed: true,
          is_external_staging: true,
        })
      );
    });

    act(() => {
      kanbanBoardProps?.onExternalTasksCollapsedChange?.(false);
    });

    await waitFor(() => {
      expect(
        window.localStorage.getItem(
          'personal-board-external-tasks-collapsed:board-1'
        )
      ).toBe('false');
    });
  });

  it('collapses closed task lists by default', () => {
    renderBoardViews({
      lists: [...mockLists, closedList],
    });

    expect(
      kanbanBoardProps?.lists.find((list) => list.id === 'list-closed')
    ).toEqual(
      expect.objectContaining({
        is_collapsed: true,
        status: 'closed',
      })
    );
  });

  it('persists the collapsed closed task list state per board and list', async () => {
    window.localStorage.setItem(
      'task-board-closed-list-collapsed:board-1:list-closed',
      'false'
    );

    renderBoardViews({
      lists: [...mockLists, closedList],
    });

    await waitFor(() => {
      expect(
        kanbanBoardProps?.lists.find((list) => list.id === 'list-closed')
      ).toEqual(
        expect.objectContaining({
          is_collapsed: false,
          status: 'closed',
        })
      );
    });

    act(() => {
      kanbanBoardProps?.onTaskListCollapsedChange?.('list-closed', true);
    });

    await waitFor(() => {
      expect(
        window.localStorage.getItem(
          'task-board-closed-list-collapsed:board-1:list-closed'
        )
      ).toBe('true');
      expect(
        kanbanBoardProps?.lists.find((list) => list.id === 'list-closed')
      ).toEqual(
        expect.objectContaining({
          is_collapsed: true,
          status: 'closed',
        })
      );
    });
  });

  it('excludes deleted lists from active board views and create shortcuts', () => {
    const listsWithDeletedFirst: TaskList[] = [
      {
        ...mockLists[0]!,
        deleted: true,
        id: 'list-deleted',
        name: 'Deleted',
        position: -1,
      },
      ...mockLists,
    ];

    renderBoardViews({ lists: listsWithDeletedFirst });

    expect(kanbanBoardProps?.lists).toEqual(mockLists);

    fireEvent.keyDown(document, { key: 'c' });

    expect(createTaskMock).toHaveBeenCalledTimes(1);
    expect(createTaskMock).toHaveBeenCalledWith(
      'board-1',
      'list-1',
      mockLists,
      {
        assignees: [],
        dueDateRange: null,
        estimationRange: null,
        includeMyTasks: false,
        includeUnassigned: false,
        labels: [],
        priorities: [],
        projects: [],
        sourceBoardIds: [],
        sourceScope: 'all_visible',
        sourceWorkspaceIds: [],
      }
    );
  });

  it('passes the effective workspace id into board header', () => {
    renderBoardViews();

    expect(boardHeaderProps?.workspaceId).toBe('ws-1');
  });

  it('rerenders kanban when the task list cache changes', async () => {
    const { queryClient } = renderBoardViews();

    expect(kanbanBoardProps?.lists).toEqual(mockLists);

    await act(async () => {
      queryClient.setQueryData(
        ['task_lists', 'board-1'],
        [
          mockLists[0],
          {
            ...mockLists[1]!,
            name: 'Doing',
          },
        ]
      );
    });

    await waitFor(() => {
      expect(kanbanBoardProps?.lists).toEqual([
        mockLists[0],
        {
          ...mockLists[1]!,
          name: 'Doing',
        },
      ]);
    });
  });

  it('removes deleted lists from kanban when the task list cache updates', async () => {
    const { queryClient } = renderBoardViews();

    await act(async () => {
      queryClient.setQueryData(
        ['task_lists', 'board-1'],
        [
          mockLists[0],
          {
            ...mockLists[1]!,
            deleted: true,
          },
        ]
      );
    });

    await waitFor(() => {
      expect(kanbanBoardProps?.lists).toEqual([mockLists[0]]);
    });
  });

  it('eagerly fetches the full board task set when switching to list view', async () => {
    renderBoardViews();

    expect(listWorkspaceTasksMock).not.toHaveBeenCalled();

    await act(async () => {
      boardHeaderProps?.onViewChange('list');
    });

    await waitFor(() => {
      expect(listWorkspaceTasksMock).toHaveBeenCalledTimes(1);
    });
  });

  it('passes persisted source filters into the full task query', async () => {
    renderBoardViews();

    act(() => {
      boardHeaderProps?.onFiltersChange({
        ...boardHeaderProps.filters,
        sourceBoardIds: ['board-2'],
        sourceScope: 'external_specific',
        sourceWorkspaceIds: ['ws-2'],
      });
    });

    await waitFor(() => {
      expect(boardHeaderProps?.filters.sourceScope).toBe('external_specific');
    });

    await act(async () => {
      boardHeaderProps?.onViewChange('list');
    });

    await waitFor(() => {
      expect(listWorkspaceTasksMock).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          boardId: 'board-1',
          sourceBoardIds: ['board-2'],
          sourceScope: 'external_specific',
          sourceWorkspaceIds: ['ws-2'],
        })
      );
    });
  });

  it('uses server-side search counts to hide task lists without matching tasks', async () => {
    listWorkspaceTasksMock.mockImplementation(async (_workspaceId, options) => {
      if (options?.includeListCounts) {
        return {
          listCounts: [{ count: 1, list_id: 'list-1' }],
          tasks: [],
        };
      }

      return { tasks: [mockTasks[0]!] };
    });

    renderBoardViews();

    act(() => {
      boardHeaderProps?.onFiltersChange({
        ...boardHeaderProps.filters,
        estimationRange: { max: 5, min: 2 },
        searchQuery: 'TIMELINE',
      });
    });

    await waitFor(() => {
      expect(listWorkspaceTasksMock).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          boardId: 'board-1',
          estimationMax: 5,
          estimationMin: 2,
          includeListCounts: true,
          limit: 0,
          q: 'TIMELINE',
        })
      );
    });

    await waitFor(() => {
      expect(kanbanBoardProps?.lists).toEqual([mockLists[0]]);
    });
  });

  it('does not auto-load progressive list pages for server-backed source scopes', async () => {
    progressivePagination = {
      'list-1': {
        hasMore: true,
        isInitialLoad: false,
        isLoading: false,
        page: 0,
        totalCount: 100,
      },
    };
    renderBoardViews();

    act(() => {
      boardHeaderProps?.onFiltersChange({
        ...boardHeaderProps.filters,
        sourceScope: 'external_current_workspace',
      });
    });

    await waitFor(() => {
      expect(listWorkspaceTasksMock).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          boardId: 'board-1',
          sourceScope: 'external_current_workspace',
        })
      );
    });

    expect(loadListPageMock).not.toHaveBeenCalled();
  });

  it('preserves board-level sorted task order when rendering list view', async () => {
    renderBoardViews();

    await act(async () => {
      boardHeaderProps?.onFiltersChange({
        ...boardHeaderProps.filters,
        sortBy: 'name-asc',
      });
      boardHeaderProps?.onViewChange('list');
    });

    await waitFor(() => {
      expect(screen.getByTestId('list-view')).toBeInTheDocument();
    });

    expect(listViewProps?.preserveTaskOrder).toBe(true);
  });

  it('eagerly fetches the full board task set when switching to timeline view', async () => {
    renderBoardViews();

    await act(async () => {
      boardHeaderProps?.onViewChange('timeline');
    });

    await waitFor(() => {
      expect(listWorkspaceTasksMock).toHaveBeenCalledTimes(1);
    });
  });

  it('restores a persisted timeline view before interaction and primes the full task cache', async () => {
    window.localStorage.setItem(
      getBoardConfigKey(mockBoard.id),
      JSON.stringify({
        currentView: 'timeline',
        filters: {
          assignees: [],
          dueDateRange: null,
          estimationRange: null,
          includeMyTasks: false,
          includeUnassigned: false,
          labels: [],
          priorities: [],
          projects: [],
          sourceBoardIds: [],
          sourceScope: 'all_visible',
          sourceWorkspaceIds: [],
        },
        listStatusFilter: 'all',
      })
    );

    renderBoardViews();

    await waitFor(() => {
      expect(screen.getByTestId('timeline-view')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(listWorkspaceTasksMock).toHaveBeenCalledTimes(1);
    });
  });

  it('ignores board hotkeys while typing in an input', async () => {
    renderBoardViews();
    const input = screen.getByTestId('board-header-input');

    input.focus();

    fireEvent.keyDown(input, { key: 'c' });
    fireEvent.keyDown(input, { key: 'g' });
    fireEvent.keyDown(input, { key: 't' });

    expect(createTaskMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId('kanban-view')).toBeInTheDocument();
    });
  });
});
