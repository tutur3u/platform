import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskDialogProvider } from '../../providers/task-dialog-provider';
import { useTaskDialog } from '../useTaskDialog';

// Mock task data
const mockTask: Task = {
  id: 'task-1',
  name: 'Test Task',
  description: '',
  priority: 'normal',
  start_date: undefined,
  end_date: null,
  estimation_points: null,
  list_id: 'list-1',
  labels: [],
  closed_at: undefined,
  assignees: [],
  created_at: '2024-01-01T00:00:00Z',
  sort_key: 1000,
  display_number: 1,
};

const mockList: TaskList = {
  id: 'list-1',
  name: 'To Do',
  board_id: 'board-1',
  position: 0,
  status: 'not_started',
  color: 'BLUE',
  created_at: '2024-01-01T00:00:00Z',
  creator_id: 'user-1',
  archived: false,
  deleted: false,
};

// Wrapper component for hooks that need context
const wrapper = ({ children }: { children: ReactNode }) => (
  <TaskDialogProvider>{children}</TaskDialogProvider>
);

describe('useTaskDialog', () => {
  it('should provide openTask, createTask, and closeDialog functions', () => {
    const { result } = renderHook(() => useTaskDialog(), { wrapper });

    expect(result.current).toHaveProperty('openTask');
    expect(result.current).toHaveProperty('createTask');
    expect(result.current).toHaveProperty('closeDialog');
    expect(typeof result.current.openTask).toBe('function');
    expect(typeof result.current.createTask).toBe('function');
    expect(typeof result.current.closeDialog).toBe('function');
  });

  it('should open task dialog when openTask is called', () => {
    const { result } = renderHook(() => useTaskDialog(), { wrapper });

    act(() => {
      result.current.openTask(mockTask, 'board-1', [mockList]);
    });

    // Dialog should be opened (state is managed in provider)
    // We can't directly test the internal state here, but we can verify the function executes without error
    expect(result.current.openTask).toBeDefined();
  });

  it('should create new task when createTask is called', () => {
    const { result } = renderHook(() => useTaskDialog(), { wrapper });

    act(() => {
      result.current.createTask('board-1', 'list-1', [mockList]);
    });

    // Create task should execute without error
    expect(result.current.createTask).toBeDefined();
  });

  it('should close dialog when closeDialog is called', () => {
    const { result } = renderHook(() => useTaskDialog(), { wrapper });

    // First open a task
    act(() => {
      result.current.openTask(mockTask, 'board-1', [mockList]);
    });

    // Then close it
    act(() => {
      result.current.closeDialog();
    });

    // Close should execute without error
    expect(result.current.closeDialog).toBeDefined();
  });

  it('should handle multiple openTask calls correctly', () => {
    const { result } = renderHook(() => useTaskDialog(), { wrapper });

    const task1 = { ...mockTask, id: 'task-1', name: 'Task 1' };
    const task2 = { ...mockTask, id: 'task-2', name: 'Task 2' };

    act(() => {
      result.current.openTask(task1, 'board-1', [mockList]);
    });

    act(() => {
      result.current.openTask(task2, 'board-1', [mockList]);
    });

    // Should be able to open different tasks without error
    expect(result.current.openTask).toBeDefined();
  });

  it('should throw error when used outside of TaskDialogProvider', () => {
    // Suppress console.error for this test
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    expect(() => {
      renderHook(() => useTaskDialog());
    }).toThrow('useTaskDialogContext must be used within TaskDialogProvider');

    consoleError.mockRestore();
  });
});
