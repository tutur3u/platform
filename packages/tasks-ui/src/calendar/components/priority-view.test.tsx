import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const scheduling = vi.fn();
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@tuturuuu/ui/hooks/use-calendar', () => ({
  useCalendar: () => ({ setOnTaskScheduled: vi.fn() }),
}));
vi.mock('../../tu-do/hooks/useTaskDialog', () => ({
  useTaskDialog: () => ({ openTaskById: vi.fn(), onUpdate: vi.fn() }),
}));
vi.mock('./use-task-schedule-batch', () => ({
  useTaskScheduleBatch: () => ({
    isLoading: false,
    minutesByTaskId: {},
    settingsByTaskId: {},
  }),
}));
vi.mock('./actions-dropdown', () => ({
  default: () => (
    <button type="button" aria-label="more-actions">
      more
    </button>
  ),
}));
vi.mock('./priority-dropdown', () => ({
  default: () => (
    <button type="button" aria-label="edit-priority">
      priority
    </button>
  ),
}));
vi.mock('./quick-task-dialog', () => ({ QuickTaskDialog: () => null }));
vi.mock('./scheduling-dialog', () => ({
  SchedulingDialog: ({
    open,
    task,
  }: {
    open: boolean;
    task?: { id: string };
  }) => {
    if (open) scheduling(task?.id);
    return null;
  },
}));

import PriorityView from './priority-view';

const task = (id: string, name: string) =>
  ({ id, name, priority: 'critical', closed_at: null }) as never;

describe('PriorityView keyboard access', () => {
  it('labels the search field and the create control', () => {
    render(<PriorityView wsId="ws" allTasks={[]} assigneeId="user" />);
    expect(screen.getByRole('textbox', { name: 'search_tasks' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'create_task' })).toBeTruthy();
  });

  it('keeps card controls outside the keyboard target and inert to it', () => {
    scheduling.mockClear();
    render(
      <PriorityView
        wsId="ws"
        allTasks={[task('t1', 'Write report')]}
        assigneeId="user"
      />
    );
    const target = screen.getByRole('button', { name: 'Write report' });
    for (const name of ['more-actions', 'edit-priority']) {
      const control = screen.getByRole('button', { name });
      expect(target.contains(control)).toBe(false);
      expect(control.closest('[role="button"]')).toBeNull();
      fireEvent.keyDown(control, { key: 'Enter' });
    }
    expect(scheduling).not.toHaveBeenCalled();
  });

  it('opens scheduling for a task card from Enter and Space', () => {
    render(
      <PriorityView
        wsId="ws"
        allTasks={[task('t1', 'Write report'), task('t2', 'Plan week')]}
        assigneeId="user"
      />
    );
    const card = screen.getByRole('button', { name: 'Write report' });
    expect(card).toHaveAttribute('tabindex', '0');
    // The card clips overflow, so the focus indicator is drawn inside the name.
    expect(card).toHaveClass(
      'focus-visible:outline-2',
      'focus-visible:-outline-offset-2'
    );
    expect(card.className).not.toMatch(/focus-visible:ring-\d/);
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(scheduling).toHaveBeenLastCalledWith('t1');
    const second = screen.getByRole('button', { name: 'Plan week' });
    fireEvent.keyDown(second, { key: ' ' });
    expect(scheduling).toHaveBeenLastCalledWith('t2');
  });
});
