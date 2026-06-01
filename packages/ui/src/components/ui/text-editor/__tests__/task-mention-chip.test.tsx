/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskMentionChip } from '../task-mention-chip';

const mocks = vi.hoisted(() => ({
  getCurrentUserTask: vi.fn(),
  listWorkspaceTasks: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  cleanupWorkspaceTaskMentions: vi.fn(),
  listWorkspaceTaskLists: vi.fn(),
  listWorkspaceTaskProjects: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getCurrentUserTask: mocks.getCurrentUserTask,
  listWorkspaceTasks: mocks.listWorkspaceTasks,
}));

vi.mock('@tuturuuu/ui/hooks/use-workspace-members', () => ({
  useWorkspaceMembers: () => ({ data: [], isLoading: false }),
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  useBoardConfig: () => ({ data: undefined }),
  useWorkspaceLabels: () => ({ data: [], isLoading: false }),
}));

vi.mock('../../../../hooks/use-dom-resolved-theme', () => ({
  useDomResolvedTheme: () => 'light',
}));

vi.mock('../../../../hooks/use-task-actions', () => ({
  useTaskActions: () => ({
    handleMoveToCompletion: vi.fn(),
    handleMoveToClose: vi.fn(),
    handleDelete: vi.fn(),
    handleMoveToList: vi.fn(),
    handleDueDateChange: vi.fn(),
    handlePriorityChange: vi.fn(),
    updateEstimationPoints: vi.fn(),
    handleCustomDateChange: vi.fn(),
    handleToggleAssignee: vi.fn(),
  }),
}));

vi.mock('../../tu-do/hooks/useTaskCardRelationships', () => ({
  useTaskCardRelationships: () => ({
    parentTask: null,
    childTasks: [],
    blocking: [],
    blockedBy: [],
    relatedTasks: [],
    setParentTask: vi.fn(),
    removeParentTask: vi.fn(),
    addBlockingTask: vi.fn(),
    removeBlockingTask: vi.fn(),
    addBlockedByTask: vi.fn(),
    removeBlockedByTask: vi.fn(),
    addRelatedTask: vi.fn(),
    removeRelatedTask: vi.fn(),
    isSaving: false,
    savingTaskId: null,
  }),
}));

vi.mock('../../tu-do/hooks/useTaskLabelManagement', () => ({
  useTaskLabelManagement: () => ({
    toggleTaskLabel: vi.fn(),
    createNewLabel: vi.fn(),
    newLabelName: '',
    setNewLabelName: vi.fn(),
    newLabelColor: 'BLUE',
    setNewLabelColor: vi.fn(),
    creatingLabel: false,
  }),
}));

vi.mock('../../tu-do/hooks/useTaskProjectManagement', () => ({
  useTaskProjectManagement: () => ({
    toggleTaskProject: vi.fn(),
    newProjectName: '',
    setNewProjectName: vi.fn(),
    creatingProject: false,
    createNewProject: vi.fn(),
  }),
}));

vi.mock('../../sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

function renderWithQueryClient(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('TaskMentionChip', () => {
  beforeEach(() => {
    mocks.getCurrentUserTask.mockRejectedValue(new Error('Task not found'));
    mocks.listWorkspaceTasks.mockResolvedValue({ tasks: [] });
    window.history.pushState({}, '', '/ws-1/tasks/boards/board-1');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lets unresolved task mention clicks reach the editor instead of trapping them', async () => {
    const editorClick = vi.fn();

    renderWithQueryClient(
      <div onClick={editorClick}>
        <TaskMentionChip entityId="missing-task-id" displayNumber="3" />
      </div>
    );

    await waitFor(() => {
      expect(mocks.getCurrentUserTask).toHaveBeenCalledWith('missing-task-id');
    });

    const chip = screen.getByText('#3').closest('[data-mention="true"]');
    expect(chip).not.toBeNull();

    const clickAllowed = fireEvent.click(chip!);

    expect(clickAllowed).toBe(true);
    expect(editorClick).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('repairs stale mention IDs by resolving the visible task identifier in the current board', async () => {
    const resolvedTask = {
      assignees: [],
      board_id: 'board-1',
      display_number: 3,
      id: 'live-task-id',
      labels: [],
      list_id: 'list-1',
      name: 'Complete Team Charter V1.0',
      projects: [],
      ticket_prefix: null,
    };
    const onResolvedTaskMention = vi.fn();

    mocks.getCurrentUserTask.mockImplementation(async (taskId: string) => {
      if (taskId === 'stale-task-id') {
        throw new Error('Task not found');
      }

      return {
        availableLists: [],
        task: resolvedTask,
        taskWorkspacePersonal: false,
        taskWorkspaceTier: 'FREE',
        taskWsId: 'ws-1',
      };
    });
    mocks.listWorkspaceTasks.mockResolvedValue({ tasks: [resolvedTask] });

    renderWithQueryClient(
      <TaskMentionChip
        entityId="stale-task-id"
        displayNumber="3"
        subtitle="Complete Team Charter V1.0"
        onResolvedTaskMention={onResolvedTaskMention}
      />
    );

    await waitFor(() => {
      expect(mocks.listWorkspaceTasks).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          boardId: 'board-1',
          identifier: '3',
        })
      );
    });

    await waitFor(() => {
      expect(onResolvedTaskMention).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: '3',
          entityId: 'live-task-id',
          subtitle: 'Complete Team Charter V1.0',
        })
      );
    });

    expect(
      screen
        .getByText('#3')
        .closest('[data-mention="true"]')
        ?.getAttribute('data-entity-id')
    ).toBe('live-task-id');
    expect(screen.getByText('Complete Team Charter V1.0')).toBeInTheDocument();
  });

  it('uses the mention workspace when repairing a task from another workspace', async () => {
    const resolvedTask = {
      assignees: [],
      board_id: 'board-1',
      display_number: 7,
      id: 'source-task-id',
      labels: [],
      list_id: 'list-1',
      name: 'Cross workspace task',
      projects: [],
      ticket_prefix: null,
    };
    const onResolvedTaskMention = vi.fn();

    window.history.pushState({}, '', '/route-ws/tasks/boards/board-1');
    mocks.getCurrentUserTask.mockImplementation(async (taskId: string) => {
      if (taskId === 'stale-task-id') {
        throw new Error('Task not found');
      }

      return {
        availableLists: [],
        task: resolvedTask,
        taskWorkspacePersonal: false,
        taskWorkspaceTier: 'FREE',
        taskWsId: 'source-ws',
      };
    });
    mocks.listWorkspaceTasks.mockResolvedValue({ tasks: [resolvedTask] });

    renderWithQueryClient(
      <TaskMentionChip
        entityId="stale-task-id"
        displayNumber="7"
        subtitle="Cross workspace task"
        workspaceId="source-ws"
        onResolvedTaskMention={onResolvedTaskMention}
      />
    );

    await waitFor(() => {
      expect(mocks.listWorkspaceTasks).toHaveBeenCalledWith(
        'source-ws',
        expect.objectContaining({
          boardId: 'board-1',
          identifier: '7',
        })
      );
    });

    await waitFor(() => {
      expect(onResolvedTaskMention).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'source-task-id',
          workspaceId: 'source-ws',
        })
      );
    });
  });
});
