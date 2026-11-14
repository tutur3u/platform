import { fireEvent, render, screen } from '@testing-library/react';
import type { ExtendedWorkspaceTask } from '@tuturuuu/ui/time-tracker/types';
import { describe, expect, it, vi } from 'vitest';
import { PLAN_GROUP_ROW_CAP, PlanTaskGroup } from './plan-task-group';
import type { PlanTaskHandlers } from './plan-task-row';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}));
vi.mock('./actions-dropdown', () => ({ default: () => null }));
vi.mock('./priority-dropdown', () => ({ default: () => null }));

function task(index: number, extra: Partial<ExtendedWorkspaceTask> = {}) {
  return {
    id: `task-${index}`,
    name: `Task ${index}`,
    ...extra,
  } as ExtendedWorkspaceTask;
}

function handlers(): PlanTaskHandlers {
  return {
    onOpen: vi.fn(),
    onEdit: vi.fn(),
    onScheduling: vi.fn(),
    onStartDateChange: vi.fn(),
    onDueDateChange: vi.fn(),
    onMarkDone: vi.fn(),
    onDelete: vi.fn(),
    onPriorityChange: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  };
}

function renderGroup(
  tasks: ExtendedWorkspaceTask[],
  rowHandlers = handlers(),
  collapsed = false
) {
  render(
    <PlanTaskGroup
      priority="critical"
      label="Urgent"
      tasks={tasks}
      collapsed={collapsed}
      onToggle={vi.fn()}
      scheduleFor={() => ({
        totalMinutes: 0,
        scheduledMinutes: 0,
        loading: false,
      })}
      handlers={rowHandlers}
      now={new Date('2026-11-14T12:00:00')}
    />
  );
  return rowHandlers;
}

describe('PlanTaskGroup', () => {
  it('names the priority in text and on its dot', () => {
    renderGroup([task(1)]);
    expect(screen.getByRole('button', { name: /Urgent/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Urgent' })).toBeTruthy();
  });

  it('caps the rows and shows the rest on request', () => {
    const tasks = Array.from({ length: PLAN_GROUP_ROW_CAP + 3 }, (_, i) =>
      task(i)
    );
    renderGroup(tasks);
    expect(screen.getAllByRole('listitem')).toHaveLength(PLAN_GROUP_ROW_CAP);
    fireEvent.click(screen.getByRole('button', { name: 'show_more:3' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(tasks.length);
  });

  it('opens a row with Enter and marks it done with Space', () => {
    const rowHandlers = renderGroup([task(1)]);
    const row = screen.getByRole('listitem', { name: 'Task 1' });
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(rowHandlers.onOpen).toHaveBeenCalledWith('task-1');
    fireEvent.keyDown(row, { key: ' ' });
    expect(rowHandlers.onMarkDone).toHaveBeenCalledWith('task-1');
  });

  it('does not mark a completed task done again from the keyboard', () => {
    const rowHandlers = renderGroup([
      task(1, { closed_at: '2026-11-13T00:00:00Z' }),
    ]);
    fireEvent.keyDown(screen.getByRole('listitem', { name: 'Task 1' }), {
      key: ' ',
    });
    expect(rowHandlers.onMarkDone).not.toHaveBeenCalled();
  });

  it('marks only an overdue open task in the danger colour', () => {
    renderGroup([
      task(1, { due_date: '2026-11-10' }),
      task(2, { due_date: '2026-11-20' }),
    ]);
    expect(screen.getByText('11/10').className).toContain('text-dynamic-red');
    expect(screen.getByText('11/20').className).not.toContain(
      'text-dynamic-red'
    );
  });

  it('hides the rows when collapsed', () => {
    renderGroup([task(1)], handlers(), true);
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
