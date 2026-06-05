import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it } from 'vitest';
import type { TaskCardProps } from './task-card';
import { areTaskCardPropsEqual } from './task-card-comparator';

const task: Task = {
  created_at: '2026-05-07T00:00:00.000Z',
  display_number: 1,
  id: 'task-1',
  list_id: 'list-1',
  name: 'Task',
};

const taskList: TaskList = {
  archived: false,
  board_id: 'board-1',
  color: 'BLUE',
  created_at: '2026-05-07T00:00:00.000Z',
  creator_id: 'user-1',
  deleted: false,
  id: 'list-1',
  name: 'To Do',
  position: 0,
  status: 'not_started',
};

type StaticTaskCardOverrides = Partial<TaskCardProps> & {
  dragDisabled?: boolean;
  sortableId?: string;
};

function taskCardProps(overrides: StaticTaskCardOverrides = {}): TaskCardProps {
  return {
    boardId: 'board-1',
    onUpdate: () => {},
    task,
    taskList,
    ...overrides,
  } as TaskCardProps;
}

describe('areTaskCardPropsEqual', () => {
  it('rerenders when static drag behavior changes', () => {
    expect(
      areTaskCardPropsEqual(
        taskCardProps({ dragDisabled: false }),
        taskCardProps({ dragDisabled: true })
      )
    ).toBe(false);
  });

  it('rerenders when the sortable id changes', () => {
    expect(
      areTaskCardPropsEqual(
        taskCardProps({ sortableId: 'task-1' }),
        taskCardProps({ sortableId: 'deadline-upcoming-task-1' })
      )
    ).toBe(false);
  });

  it('rerenders when personal scheduling duration changes', () => {
    expect(
      areTaskCardPropsEqual(
        taskCardProps({ task: { ...task, total_duration: null } }),
        taskCardProps({ task: { ...task, total_duration: 1.5 } })
      )
    ).toBe(false);
  });

  it('rerenders a selected card when the bulk selection grows', () => {
    expect(
      areTaskCardPropsEqual(
        taskCardProps({
          isMultiSelectMode: true,
          isSelected: true,
          selectedTasks: new Set(['task-1']),
        }),
        taskCardProps({
          isMultiSelectMode: true,
          isSelected: true,
          selectedTasks: new Set(['task-1', 'task-2']),
        })
      )
    ).toBe(false);
  });

  it('rerenders a selected card when the bulk selection changes with the same size', () => {
    expect(
      areTaskCardPropsEqual(
        taskCardProps({
          isMultiSelectMode: true,
          isSelected: true,
          selectedTasks: new Set(['task-1', 'task-2']),
        }),
        taskCardProps({
          isMultiSelectMode: true,
          isSelected: true,
          selectedTasks: new Set(['task-1', 'task-3']),
        })
      )
    ).toBe(false);
  });
});
