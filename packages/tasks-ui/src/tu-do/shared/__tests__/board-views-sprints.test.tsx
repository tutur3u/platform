import '@testing-library/jest-dom';
import { HotkeysProvider } from '@tanstack/react-hotkeys';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardViews } from '../board-views';

const listWorkspaceTasksMock = vi.hoisted(() => vi.fn());
const listBoardSprintsMock = vi.hoisted(() => vi.fn());
let boardHeaderProps:
  | React.ComponentProps<typeof import('../board-header')['BoardHeader']>
  | undefined;
let kanbanBoardProps:
  | React.ComponentProps<
      typeof import('../../boards/boardId/kanban')['KanbanBoard']
    >
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
  useTaskDialog: () => ({ createTask: vi.fn() }),
}));
vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTasks: listWorkspaceTasksMock,
}));
vi.mock('@tuturuuu/internal-api/task-sprints', () => ({
  listWorkspaceTaskBoardSprints: (...args: unknown[]) =>
    listBoardSprintsMock(...args),
  moveTasksToWorkspaceTaskBoardSprint: vi.fn(),
  startWorkspaceTaskBoardSprint: vi.fn(),
  updateWorkspaceTaskBoardSprint: vi.fn(),
  updateWorkspaceTaskBoardSprintLength: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/users', () => ({
  TASK_BOARD_PINNED_SPECIAL_LISTS_CONFIG_ID: 'TASK_BOARD_PINNED_SPECIAL_LISTS',
  TASK_LAST_BOARD_VIEW_CONFIG_ID: 'TASK_LAST_BOARD_VIEW',
  TASK_QUICK_CREATE_TARGET_LIST_CONFIG_ID: 'TASK_QUICK_CREATE_TARGET_LIST',
  getUserConfig: async () => ({ value: null }),
  getUserWorkspaceConfig: async () => ({ value: null }),
  updateUserConfig: async () => ({ message: 'ok' }),
  updateUserWorkspaceConfig: async () => ({ message: 'ok' }),
}));
vi.mock('../progressive-loader-context', () => ({
  useProgressiveLoader: () => ({
    loadListPage: vi.fn(),
    revalidateLoadedLists: vi.fn().mockResolvedValue(undefined),
    pagination: {},
  }),
}));
vi.mock('../kanban-presentation', () => import('./mocks/kanban-presentation'));
vi.mock('../board-header', () => ({
  BoardHeader: (props: any) => {
    boardHeaderProps = props;
    return <div data-testid="board-header" />;
  },
}));
vi.mock('../recycle-bin-panel', () => ({
  RecycleBinContent: () => null,
}));
vi.mock('../../drafts/drafts-page', () => ({
  DraftsPage: () => null,
}));
vi.mock('../../my-tasks/my-tasks-content', () => ({
  default: () => null,
}));
vi.mock('../../boards/boardId/kanban', () => ({
  KanbanBoard: (props: any) => {
    kanbanBoardProps = props;
    return <div data-testid="kanban-view" />;
  },
}));
vi.mock('../list-view', () => ({ ListView: () => null }));
vi.mock('../../boards/boardId/timeline-board', () => ({
  TimelineBoard: () => null,
}));

const mockBoard = {
  id: 'board-1',
  name: 'Roadmap',
  ticket_prefix: 'RD',
  ws_id: 'ws-1',
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

function renderBoardViews({ tasks }: { tasks: Task[] }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider>
        <BoardViews
          board={mockBoard as any}
          currentUserId="user-1"
          lists={mockLists}
          tasks={tasks}
          workspace={{ id: 'ws-1', personal: false } as any}
          workspaceLabels={[]}
        />
      </HotkeysProvider>
    </QueryClientProvider>
  );
}

describe('BoardViews sprints', () => {
  beforeEach(() => {
    boardHeaderProps = undefined;
    kanbanBoardProps = undefined;
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    listWorkspaceTasksMock.mockReset();
    listWorkspaceTasksMock.mockResolvedValue({ tasks: mockTasks });
    listBoardSprintsMock.mockReset();
    listBoardSprintsMock.mockResolvedValue({
      schemaAvailable: true,
      sprintLengthWeeks: null,
      sprints: [],
    });
  });

  it('shows only the running sprint on a board with sprints on', async () => {
    const otherTask = { ...mockTasks[0]!, id: 'task-2', name: 'Next sprint' };
    listBoardSprintsMock.mockResolvedValue({
      schemaAvailable: true,
      sprintLengthWeeks: 2,
      sprints: [
        {
          id: 'sprint-14',
          name: 'Sprint 14',
          sequence_number: 14,
          status: 'active',
          start_date: '2026-10-19',
          end_date: '2026-10-30',
          goal: null,
          goal_result: null,
          started_at: '2026-10-19T08:00:00Z',
          ended_at: null,
          tasks: [
            {
              task_id: 'task-1',
              added_after_start: false,
              carry_count: 0,
              end_decision: null,
            },
          ],
          report: null,
        },
        {
          id: 'sprint-15',
          name: 'Sprint 15',
          sequence_number: 15,
          status: 'planned',
          start_date: '2026-11-02',
          end_date: '2026-11-13',
          goal: null,
          goal_result: null,
          started_at: null,
          ended_at: null,
          tasks: [
            {
              task_id: 'task-2',
              added_after_start: false,
              carry_count: 0,
              end_decision: null,
            },
          ],
          report: null,
        },
      ],
    });

    renderBoardViews({ tasks: [mockTasks[0]!, otherTask] });

    await waitFor(() => {
      expect(kanbanBoardProps?.tasks.map((task) => task.id)).toEqual([
        'task-1',
      ]);
    });
    expect(boardHeaderProps?.sprintSlot).toBeTruthy();
    // Header counts follow the sprint too: one unassigned task, not two.
    expect(boardHeaderProps?.unassignedCount).toBe(1);
  });

  it('keeps every task when the board has sprints off', async () => {
    const otherTask = { ...mockTasks[0]!, id: 'task-2', name: 'Other' };
    renderBoardViews({ tasks: [mockTasks[0]!, otherTask] });

    await waitFor(() => expect(listBoardSprintsMock).toHaveBeenCalled());
    expect(kanbanBoardProps?.tasks.map((task) => task.id)).toEqual([
      'task-1',
      'task-2',
    ]);
    // No pill, so the breadcrumb shows no separator after the board.
    expect(boardHeaderProps?.sprintSlot).toBeUndefined();
  });
});
