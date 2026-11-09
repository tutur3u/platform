import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SprintSummaryDialog } from './sprint-summary-dialog';

const api = vi.hoisted(() => ({
  end: vi.fn(),
  listBoardTasksForSearch: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en-GB',
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join('/')}` : key,
}));

vi.mock('@tuturuuu/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <dialog open>{children}</dialog> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: api.toastSuccess },
}));

vi.mock('@tuturuuu/internal-api/task-sprints', () => ({
  endWorkspaceTaskBoardSprint: api.end,
  listWorkspaceTaskBoardSprints: vi.fn(),
  moveTasksToWorkspaceTaskBoardSprint: vi.fn(),
  startWorkspaceTaskBoardSprint: vi.fn(),
  updateWorkspaceTaskBoardSprintLength: vi.fn(),
}));

vi.mock('../../board-task-search', () => ({
  listBoardTasksForSearch: api.listBoardTasksForSearch,
}));

const entry = (task_id: string, carry_count = 0) => ({
  task_id,
  added_after_start: false,
  carry_count,
  end_decision: null,
});

const sprint = (extra: Partial<BoardSprint>): BoardSprint => ({
  id: 'sprint-14',
  name: 'Sprint 14',
  sequence_number: 14,
  status: 'active',
  start_date: '2026-10-19',
  end_date: '2026-10-30',
  goal: 'Ship sprint planning',
  goal_result: null,
  started_at: '2026-10-19T08:00:00Z',
  ended_at: null,
  tasks: [entry('t1'), entry('t2', 2), entry('t3')],
  report: null,
  ...extra,
});

const next = sprint({ id: 'sprint-15', name: 'Sprint 15', status: 'planned' });

const task = (id: string, extra: Partial<Task> = {}) =>
  ({
    id,
    name: `Task ${id}`,
    list_id: 'list-todo',
    display_number: Number(id.slice(1)),
    estimation_points: 3,
    assignees: [{ id: 'u-ana', display_name: 'Ana' }],
    ...extra,
  }) as Task;

const lists = [
  { id: 'list-todo', name: 'To Do', status: 'not_started' },
  { id: 'list-doing', name: 'In Progress', status: 'active' },
] as TaskList[];

function renderSummary(props: {
  mode: 'live' | 'report';
  shown: BoardSprint;
  onEnded?: () => void;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SprintSummaryDialog
        boardId="board-1"
        canEnd
        lists={lists}
        nextSprint={next}
        onEnded={props.onEnded}
        onOpenChange={vi.fn()}
        sprint={props.shown}
        target={{ mode: props.mode, sprintId: props.shown.id }}
        wsId="ws-1"
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listBoardTasksForSearch.mockResolvedValue([
    task('t1', { completed_at: '2026-10-22T10:00:00Z' }),
    task('t2'),
    task('t3', { assignees: [], list_id: 'list-doing' }),
  ]);
});

describe('SprintSummaryDialog', () => {
  it('counts open tasks per status and moves them all on End', async () => {
    api.end.mockResolvedValue({
      report: { carried_tasks: 2, backlog_tasks: 0 },
      schemaAvailable: true,
      sprintLengthWeeks: 2,
      sprints: [],
    });
    const onEnded = vi.fn();
    renderSummary({ mode: 'live', onEnded, shown: sprint({}) });

    expect(await screen.findByText('Task t2')).toBeInTheDocument();
    expect(screen.queryByText('Task t1')).not.toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    const doing = screen.getByText('In Progress').parentElement!;
    expect(doing).toHaveTextContent('In Progress1');
    expect(screen.getByText('To Do').parentElement).toHaveTextContent('To Do1');
    expect(screen.getByText('end_moves:2/Sprint 15')).toBeInTheDocument();
    expect(screen.queryByText(/goal/)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'end_and_plan:Sprint 15' })
    );

    await waitFor(() =>
      expect(api.end).toHaveBeenCalledWith('ws-1', 'board-1', 'sprint-14', {})
    );
    await waitFor(() => expect(onEnded).toHaveBeenCalled());
    expect(api.toastSuccess).toHaveBeenCalledWith(
      'ended_toast:2/Sprint 14/Sprint 15'
    );
  });

  it('keeps End disabled until the sprint tasks have loaded', async () => {
    api.listBoardTasksForSearch.mockReturnValue(new Promise(() => undefined));
    renderSummary({ mode: 'live', shown: sprint({}) });

    expect(await screen.findByText('loading_tasks')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'end_and_plan:Sprint 15' })
    ).toBeDisabled();
  });

  it('offers a retry and keeps End disabled when the tasks fail to load', async () => {
    api.listBoardTasksForSearch.mockRejectedValue(new Error('offline'));
    renderSummary({ mode: 'live', shown: sprint({}) });

    expect(await screen.findByText('tasks_failed')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'end_and_plan:Sprint 15' })
    ).toBeDisabled();

    api.listBoardTasksForSearch.mockResolvedValue([task('t2')]);
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(await screen.findByText('Task t2')).toBeInTheDocument();
  });

  it('shows an ended sprint as its stored report', async () => {
    renderSummary({
      mode: 'report',
      shown: sprint({
        status: 'completed',
        goal_result: 'met',
        report: {
          ended_at: '2026-10-30T17:00:00Z',
          ended_by: null,
          next_cycle_id: 'sprint-15',
          goal: 'Ship sprint planning',
          goal_result: 'met',
          total_tasks: 14,
          done_tasks: 12,
          added_tasks: 2,
          carried_in_tasks: 1,
          carried_tasks: 1,
          backlog_tasks: 1,
          committed_points: 34,
          done_points: 31,
          added_points: 4,
          people: [],
        },
      }),
    });

    expect(screen.getByText('report_title:Sprint 14')).toBeInTheDocument();
    expect(screen.getByText('12 / 14')).toBeInTheDocument();
    expect(screen.getByText('carried_next').parentElement).toHaveTextContent(
      'carried_next2'
    );
    expect(
      screen.queryByRole('button', { name: /end_and_plan/ })
    ).not.toBeInTheDocument();
    expect(api.listBoardTasksForSearch).not.toHaveBeenCalled();
  });
});
