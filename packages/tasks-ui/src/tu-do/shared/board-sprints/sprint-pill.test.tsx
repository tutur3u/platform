import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SprintPill } from './sprint-pill';

vi.mock('next-intl', () => ({
  useLocale: () => 'en-GB',
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
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

const sprint = (
  sequence: number,
  status: BoardSprint['status'],
  taskIds: string[],
  extra: Partial<BoardSprint> = {}
): BoardSprint => ({
  id: `sprint-${sequence}`,
  name: `Sprint ${sequence}`,
  sequence_number: sequence,
  status,
  start_date: '2026-10-19',
  end_date: '2026-10-30',
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
  ...extra,
});

const closed = sprint(13, 'completed', ['a'], {
  report: {
    ended_at: '2026-10-16T17:00:00Z',
    ended_by: null,
    next_cycle_id: null,
    goal: null,
    goal_result: null,
    total_tasks: 14,
    done_tasks: 12,
    added_tasks: 0,
    carried_in_tasks: 0,
    carried_tasks: 2,
    backlog_tasks: 0,
    committed_points: 0,
    done_points: 0,
    added_points: 0,
    people: [],
  },
});
const active = sprint(14, 'active', ['a', 'b', 'c']);
const planned = sprint(15, 'planned', ['d', 'e']);
const progress = (value: BoardSprint) => ({
  done: value.id === 'sprint-14' ? 1 : 0,
  total: value.tasks.length,
});

describe('SprintPill', () => {
  it('shows the sprint, its dates and tasks done', () => {
    render(
      <SprintPill
        canManage
        currentSprint={active}
        getProgress={progress}
        sprints={[planned, closed, active]}
      />
    );

    const trigger = screen.getByRole('button', {
      name: 'switcher_label:Sprint 14',
    });
    expect(trigger).toHaveTextContent('Sprint 14');
    expect(trigger).toHaveTextContent('19 Oct 2026 - 30 Oct 2026');
    expect(trigger).toHaveTextContent('done_count:1/3');
  });

  it('lists sprints in ascending order with their state', () => {
    render(
      <SprintPill
        canManage
        currentSprint={active}
        getProgress={progress}
        sprints={[planned, closed, active]}
      />
    );

    const rows = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Sprint 13'),
      expect.stringContaining('Sprint 14'),
      expect.stringContaining('Sprint 15'),
    ]);
    expect(rows[0]).toHaveTextContent('done_count:12/14');
    expect(rows[1]).toHaveTextContent('active');
    expect(rows[2]).toHaveTextContent('task_count:2');
  });

  it('offers Start only to managers and only when nothing is running', () => {
    const onStartSprint = vi.fn();
    const { rerender } = render(
      <SprintPill
        canManage
        currentSprint={active}
        getProgress={progress}
        onStartSprint={onStartSprint}
        sprints={[active, planned]}
      />
    );
    expect(screen.queryByText(/^start:/)).not.toBeInTheDocument();

    rerender(
      <SprintPill
        canManage
        currentSprint={planned}
        getProgress={progress}
        onStartSprint={onStartSprint}
        sprints={[closed, planned]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /start:Sprint 15/ }));
    expect(onStartSprint).toHaveBeenCalledWith(planned);

    rerender(
      <SprintPill
        canManage={false}
        currentSprint={planned}
        getProgress={progress}
        onStartSprint={onStartSprint}
        sprints={[closed, planned]}
      />
    );
    expect(
      screen.queryByRole('button', { name: /start:Sprint 15/ })
    ).not.toBeInTheDocument();
  });
});
