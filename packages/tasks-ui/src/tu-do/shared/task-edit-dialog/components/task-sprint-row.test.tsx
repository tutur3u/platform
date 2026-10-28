import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskSprintRow } from './task-sprint-row';

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  sprints: null as unknown,
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${Object.values(values).join('/')}` : key,
}));

vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button onClick={() => onSelect?.()} role="menuitem" type="button">
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../board-sprints/use-board-sprints', () => ({
  useBoardSprints: () => state.sprints,
  useBoardSprintMutations: () => ({ moveTasks: { mutate: state.mutate } }),
}));

const sprint = (
  sequence: number,
  status: BoardSprint['status'],
  taskIds: string[],
  dates: [string, string]
): BoardSprint => ({
  id: `sprint-${sequence}`,
  name: `Sprint ${sequence}`,
  sequence_number: sequence,
  status,
  start_date: dates[0],
  end_date: dates[1],
  goal: null,
  goal_result: null,
  started_at: null,
  ended_at: null,
  tasks: taskIds.map((task_id) => ({
    task_id,
    added_after_start: false,
    carry_count: 0,
    end_decision: null,
  })),
  report: null,
});

const done = sprint(1, 'completed', ['t1'], ['2026-10-19', '2026-10-23']);
const running = sprint(2, 'active', ['t1'], ['2026-10-26', '2026-11-06']);
const next = sprint(3, 'planned', [], ['2026-11-09', '2026-11-20']);

function setSprints(list: BoardSprint[], sprintsOn = true) {
  state.sprints = {
    sprintsOn,
    sprints: list,
    openSprintByTaskId: new Map(
      list
        .filter((s) => s.status === 'active' || s.status === 'planned')
        .flatMap((s) => s.tasks.map((t) => [t.task_id, s] as const))
    ),
  };
}

const task = (extra: Partial<Task> = {}) =>
  ({
    id: 't1',
    name: 'Task',
    list_id: 'l',
    display_number: 1,
    ...extra,
  }) as Task;

beforeEach(() => {
  vi.clearAllMocks();
  setSprints([done, running, next]);
});

describe('TaskSprintRow', () => {
  it('shows the sprint, its end as the due date and the sprint history', () => {
    render(<TaskSprintRow boardId="b" canEdit task={task()} wsId="w" />);
    expect(screen.getByText(/^Sprint 2 · /)).toBeInTheDocument();
    expect(screen.getByText('due_with_sprint:6 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('sprint_history:1, 2')).toBeInTheDocument();
  });

  it('keeps an own due date and shows no sprint due line', () => {
    render(
      <TaskSprintRow
        boardId="b"
        canEdit
        task={task({ end_date: '2026-11-02T10:00:00Z' })}
        wsId="w"
      />
    );
    expect(screen.queryByText(/due_with_sprint/)).not.toBeInTheDocument();
  });

  it('moves the task to another open sprint', () => {
    render(<TaskSprintRow boardId="b" canEdit task={task()} wsId="w" />);
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'move_to_sprint:Sprint 3' })
    );
    expect(state.mutate).toHaveBeenCalledWith(
      { sprintId: 'sprint-3', taskIds: ['t1'] },
      expect.any(Object)
    );
  });

  it('renders nothing with sprints off, and no menu when read-only', () => {
    setSprints([], false);
    const { container, rerender } = render(
      <TaskSprintRow boardId="b" canEdit task={task()} wsId="w" />
    );
    expect(container).toBeEmptyDOMElement();

    setSprints([done, running, next]);
    rerender(
      <TaskSprintRow boardId="b" canEdit={false} task={task()} wsId="w" />
    );
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });
});
