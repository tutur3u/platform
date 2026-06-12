import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineBoard } from './timeline-board';

const createTaskMock = vi.hoisted(() => vi.fn());
const openTaskMock = vi.hoisted(() => vi.fn());
const openTaskByIdMock = vi.hoisted(() => vi.fn());
const updateWorkspaceTaskMock = vi.hoisted(() => vi.fn());
const deleteWorkspaceTaskMock = vi.hoisted(() => vi.fn());

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  updateWorkspaceTask: updateWorkspaceTaskMock,
  deleteWorkspaceTask: deleteWorkspaceTaskMock,
}));

vi.mock('../../hooks/useTaskDialog', () => ({
  useTaskDialog: () => ({
    createTask: createTaskMock,
    openTask: openTaskMock,
    openTaskById: openTaskByIdMock,
  }),
}));

vi.mock('./timeline/timeline-grid', () => ({
  TimelineGrid: ({
    localTasks,
    onOpenTask,
  }: {
    localTasks: Task[];
    onOpenTask: (task: Task) => void;
  }) => (
    <button
      type="button"
      data-testid="open-timeline-task"
      onClick={() => onOpenTask(localTasks[0]!)}
    >
      Open timeline task
    </button>
  ),
}));

const lists: TaskList[] = [
  {
    archived: false,
    board_id: 'board-1',
    color: 'GRAY',
    created_at: '2026-05-01T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'todo',
    name: 'To Do',
    position: 0,
    status: 'not_started',
  },
];

function task(overrides: Partial<Task> & Pick<Task, 'id' | 'name'>): Task {
  return {
    created_at: '2026-05-01T00:00:00.000Z',
    display_number: 1,
    end_date: null,
    labels: [],
    list_id: 'todo',
    priority: 'normal',
    sort_key: 1,
    start_date: null,
    ...overrides,
  } as Task;
}

function renderTimeline(tasks: Task[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TimelineBoard
        boardId="board-1"
        lists={lists}
        tasks={tasks}
        wsId="ws-1"
      />
    </QueryClientProvider>
  );
}

describe('TimelineBoard task opening', () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    openTaskMock.mockReset();
    openTaskByIdMock.mockReset();
    updateWorkspaceTaskMock.mockReset();
    deleteWorkspaceTaskMock.mockReset();
  });

  it('opens external source tasks through the hydrating task-by-id path immediately', () => {
    renderTimeline([
      task({
        id: 'external-timeline-task',
        name: 'External timeline task',
        list_id: 'personal-list',
        personal_board_id: 'board-1',
        is_personal_external: true,
        source_workspace_id: 'source-ws',
        source_board_id: 'source-board',
        source_board_name: 'Source board',
        source_list_id: 'source-list',
        source_list_name: 'Source list',
      }),
    ]);

    fireEvent.click(screen.getByTestId('open-timeline-task'));

    expect(openTaskByIdMock).toHaveBeenCalledWith(
      'external-timeline-task',
      expect.objectContaining({
        boardId: 'source-board',
        taskWsId: 'source-ws',
        taskWorkspacePersonal: false,
        initialTask: expect.objectContaining({
          id: 'external-timeline-task',
          list_id: 'source-list',
          name: 'External timeline task',
        }),
        initialSharedContext: expect.objectContaining({
          boardConfig: expect.objectContaining({
            id: 'source-board',
            name: 'Source board',
            ws_id: 'source-ws',
          }),
          availableLists: [
            expect.objectContaining({
              id: 'source-list',
              name: 'Source list',
              board_id: 'source-board',
            }),
          ],
        }),
      })
    );
    expect(openTaskMock).not.toHaveBeenCalled();
  });
});
