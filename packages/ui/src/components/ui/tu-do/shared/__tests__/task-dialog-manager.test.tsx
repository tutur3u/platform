import '@testing-library/jest-dom';
import { fireEvent, render, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  TaskDialogProvider,
  useTaskDialogContext,
} from '../../providers/task-dialog-provider';
import { TaskDialogManager } from '../task-dialog-manager';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/workspace-1/tasks',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ wsId: 'workspace-1' }),
}));

// Mock the TaskEditDialog component since it's lazy-loaded
vi.mock('../task-edit-dialog', () => ({
  TaskEditDialog: ({
    isOpen,
    task,
    onClose,
  }: {
    isOpen: boolean;
    task?: Task;
    onClose: () => void;
  }) => (
    <div data-testid="task-edit-dialog" data-open={isOpen}>
      {task && <div data-testid="task-name">{task.name}</div>}
      <button type="button" onClick={onClose} data-testid="close-button">
        Close
      </button>
    </div>
  ),
}));

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

describe('TaskDialogManager', () => {
  it('should render nothing when dialog is not open', () => {
    const { container } = render(
      <TaskDialogProvider>
        <TaskDialogManager wsId="workspace-1" />
      </TaskDialogProvider>
    );

    expect(container.firstChild).toBeNull();
  });

  it.skip('should lazy load and render TaskEditDialog when opened', async () => {
    const TestComponent = () => {
      const { openTask } = useTaskDialogContext();

      React.useEffect(() => {
        // Simulate opening the dialog after mount
        openTask(mockTask, 'board-1', [mockList]);
      }, [openTask]);

      return <TaskDialogManager wsId="workspace-1" />;
    };

    const { queryByTestId } = render(
      <TaskDialogProvider>
        <TestComponent />
      </TaskDialogProvider>
    );

    // Initially, dialog should not be rendered
    expect(queryByTestId('task-edit-dialog')).not.toBeInTheDocument();

    // Wait for the dialog to be loaded and rendered
    await waitFor(
      () => {
        expect(queryByTestId('task-edit-dialog')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it('should pass correct props to TaskEditDialog', async () => {
    const TestComponent = () => {
      const { openTask } = useTaskDialogContext();

      React.useEffect(() => {
        openTask(mockTask, 'board-1', [mockList]);
      }, [openTask]);

      return <TaskDialogManager wsId="workspace-1" />;
    };

    const { getByTestId } = render(
      <TaskDialogProvider>
        <TestComponent />
      </TaskDialogProvider>
    );

    await waitFor(() => {
      expect(getByTestId('task-edit-dialog')).toBeInTheDocument();
      expect(getByTestId('task-edit-dialog')).toHaveAttribute(
        'data-open',
        'true'
      );
      expect(getByTestId('task-name')).toHaveTextContent('Test Task');
    });
  });

  it('should handle Suspense boundary correctly', async () => {
    const { container } = render(
      <TaskDialogProvider>
        <TaskDialogManager wsId="workspace-1" />
      </TaskDialogProvider>
    );

    // Should not crash during lazy loading
    expect(container).toBeInTheDocument();
  });

  it('should render in create mode', async () => {
    const TestComponent = () => {
      const { createTask } = useTaskDialogContext();

      React.useEffect(() => {
        createTask('board-1', 'list-1', [mockList]);
      }, [createTask]);

      return <TaskDialogManager wsId="workspace-1" />;
    };

    const { getByTestId } = render(
      <TaskDialogProvider>
        <TestComponent />
      </TaskDialogProvider>
    );

    await waitFor(() => {
      expect(getByTestId('task-edit-dialog')).toBeInTheDocument();
    });
  });

  it('should handle close callback', async () => {
    const TestComponent = () => {
      const { openTask, state } = useTaskDialogContext();

      React.useEffect(() => {
        openTask(mockTask, 'board-1', [mockList]);
      }, [openTask]);

      return (
        <div>
          <TaskDialogManager wsId="workspace-1" />
          <div data-testid="dialog-open-state">{String(state.isOpen)}</div>
        </div>
      );
    };

    const { getByTestId } = render(
      <TaskDialogProvider>
        <TestComponent />
      </TaskDialogProvider>
    );

    await waitFor(() => {
      expect(getByTestId('dialog-open-state')).toHaveTextContent('true');
    });

    // Click close button
    const closeButton = getByTestId('close-button');
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(getByTestId('dialog-open-state')).toHaveTextContent('false');
    });
  });
});
