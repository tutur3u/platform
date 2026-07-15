import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineBoard } from './timeline-board';

const createTaskMock = vi.hoisted(() => vi.fn());
const openTaskMock = vi.hoisted(() => vi.fn());
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
  }),
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

describe('TimelineBoard', () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    openTaskMock.mockReset();
    updateWorkspaceTaskMock.mockReset();
    updateWorkspaceTaskMock.mockResolvedValue({ task: {} });
    deleteWorkspaceTaskMock.mockReset();
    deleteWorkspaceTaskMock.mockResolvedValue({ success: true, message: 'ok' });
  });

  it('renders task names in the sticky row column', () => {
    renderTimeline([
      task({
        id: 'scheduled-1',
        name: 'Readable task name at every zoom level',
        start_date: '2026-05-08T00:00:00.000Z',
        end_date: '2026-05-08T23:59:59.999Z',
      }),
    ]);

    expect(
      screen.getByText('Readable task name at every zoom level')
    ).toBeInTheDocument();
  });

  it('opens the timeline edit dialog from a task row', async () => {
    renderTimeline([
      task({
        id: 'scheduled-1',
        name: 'Open schedule editor from row',
        start_date: '2026-05-08T00:00:00.000Z',
        end_date: '2026-05-08T23:59:59.999Z',
      }),
    ]);

    fireEvent.doubleClick(screen.getByText('Open schedule editor from row'));

    expect(
      await screen.findByDisplayValue('Open schedule editor from row')
    ).toBeInTheDocument();
  });

  it('schedules an unscheduled task by dropping it on a list row', async () => {
    renderTimeline([
      task({
        id: 'unscheduled-1',
        name: 'Schedule me from the drawer',
      }),
    ]);

    const dropTarget = screen.getAllByTestId('timeline-drop-target-todo')[0]!;
    vi.spyOn(dropTarget, 'getBoundingClientRect').mockReturnValue({
      bottom: 48,
      height: 48,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const dataTransfer = {
      dropEffect: '',
      effectAllowed: 'move',
      getData: vi.fn(() => 'unscheduled-1'),
      setData: vi.fn(),
    };

    fireEvent.dragOver(dropTarget, { clientX: 112, dataTransfer });
    fireEvent.drop(dropTarget, { dataTransfer });

    await waitFor(() => {
      expect(updateWorkspaceTaskMock).toHaveBeenCalledWith(
        'ws-1',
        'unscheduled-1',
        expect.objectContaining({
          end_date: expect.any(String),
          list_id: 'todo',
          start_date: expect.any(String),
        })
      );
    });
  });

  it('uses source workspace metadata when scheduling an external timeline task', async () => {
    renderTimeline([
      task({
        id: 'external-unscheduled-1',
        name: 'Schedule external task',
        source_board_id: 'source-board-1',
        source_workspace_id: 'source-ws-1',
      } as Partial<Task> & Pick<Task, 'id' | 'name'>),
    ]);

    const dropTarget = screen.getAllByTestId('timeline-drop-target-todo')[0]!;
    vi.spyOn(dropTarget, 'getBoundingClientRect').mockReturnValue({
      bottom: 48,
      height: 48,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const dataTransfer = {
      dropEffect: '',
      effectAllowed: 'move',
      getData: vi.fn(() => 'external-unscheduled-1'),
      setData: vi.fn(),
    };

    fireEvent.dragOver(dropTarget, { clientX: 112, dataTransfer });
    fireEvent.drop(dropTarget, { dataTransfer });

    await waitFor(() => {
      expect(updateWorkspaceTaskMock).toHaveBeenCalledWith(
        'source-ws-1',
        'external-unscheduled-1',
        expect.objectContaining({
          end_date: expect.any(String),
          list_id: 'todo',
          start_date: expect.any(String),
        })
      );
    });
  });
});
