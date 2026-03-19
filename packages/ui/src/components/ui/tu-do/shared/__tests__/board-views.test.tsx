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
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { WorkspaceLabel } from '@tuturuuu/utils/task-helper';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoardConfigKey } from '../board-config-storage';
import { BoardViews } from '../board-views';

const createTaskMock = vi.fn();
const loadListPageMock = vi.fn();
let boardHeaderProps:
  | React.ComponentProps<typeof import('../board-header')['BoardHeader']>
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
  listWorkspaceTasks: vi.fn(),
}));

vi.mock('../progressive-loader-context', () => ({
  useProgressiveLoader: () => ({
    loadListPage: loadListPageMock,
    pagination: {},
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
  KanbanBoard: () => <div data-testid="kanban-view">Kanban</div>,
}));

vi.mock('../list-view', () => ({
  ListView: () => <div data-testid="list-view">List</div>,
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

function renderBoardViews() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider>
        <BoardViews
          board={mockBoard as any}
          currentUserId="user-1"
          lists={mockLists}
          tasks={mockTasks}
          workspace={mockWorkspace as any}
          workspaceLabels={mockWorkspaceLabels}
        />
      </HotkeysProvider>
    </QueryClientProvider>
  );
}

describe('BoardViews', () => {
  beforeEach(() => {
    boardHeaderProps = undefined;
    createTaskMock.mockReset();
    loadListPageMock.mockReset();
    vi.mocked(listWorkspaceTasks).mockReset();
    vi.mocked(listWorkspaceTasks).mockResolvedValue({ tasks: mockTasks });
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
      }
    );
  });

  it('eagerly fetches the full board task set when switching to list view', async () => {
    renderBoardViews();

    expect(listWorkspaceTasks).not.toHaveBeenCalled();

    await act(async () => {
      boardHeaderProps?.onViewChange('list');
    });

    await waitFor(() => {
      expect(listWorkspaceTasks).toHaveBeenCalledTimes(1);
    });
  });

  it('eagerly fetches the full board task set when switching to timeline view', async () => {
    renderBoardViews();

    await act(async () => {
      boardHeaderProps?.onViewChange('timeline');
    });

    await waitFor(() => {
      expect(listWorkspaceTasks).toHaveBeenCalledTimes(1);
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
        },
        listStatusFilter: 'all',
      })
    );

    renderBoardViews();

    await waitFor(() => {
      expect(screen.getByTestId('timeline-view')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(listWorkspaceTasks).toHaveBeenCalledTimes(1);
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
