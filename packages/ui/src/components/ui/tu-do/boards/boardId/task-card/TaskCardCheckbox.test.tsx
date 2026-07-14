import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskCardCheckbox } from './TaskCardCheckbox';

vi.mock('@tuturuuu/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const task: Task = {
  assignees: [],
  created_at: '2026-07-14T00:00:00.000Z',
  display_number: 1,
  end_date: null,
  id: 'task-1',
  labels: [],
  list_id: 'list-1',
  name: 'Rounded completion',
  priority: 'normal',
  sort_key: 1000,
  start_date: undefined,
};

const taskList: TaskList = {
  archived: false,
  board_id: 'board-1',
  color: 'GREEN',
  created_at: '2026-07-14T00:00:00.000Z',
  creator_id: 'user-1',
  deleted: false,
  id: 'list-1',
  name: 'Active',
  position: 0,
  status: 'active',
};

describe('TaskCardCheckbox', () => {
  it('renders the completion control as a circle', () => {
    render(
      <TaskCardCheckbox
        task={task}
        taskList={taskList}
        isLoading={false}
        onToggle={vi.fn()}
        tooltipLabel="Mark as Done"
      />
    );

    expect(screen.getByRole('checkbox', { name: 'Mark as Done' })).toHaveClass(
      'rounded-full'
    );
    expect(screen.getByTestId('tooltip-content')).toHaveTextContent(
      'Mark as Done'
    );
  });
});
