'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types/db';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { WorkspaceLabel } from '@tuturuuu/utils/task-helper';
import { useEffect, useMemo, useState } from 'react';
import { KanbanBoard } from '../boards/boardId/kanban';
import { StatusGroupedBoard } from '../boards/boardId/status-grouped-board';
import { TimelineBoard } from '../boards/boardId/timeline-board';
import { BoardHeader } from '../shared/board-header';
import { ListView } from '../shared/list-view';
import { TaskEditDialog } from '../shared/task-edit-dialog';

interface TaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export type ViewType = 'kanban' | 'status-grouped' | 'list' | 'timeline';

interface Props {
  workspace: Workspace;
  board: TaskBoard;
  tasks: Task[];
  lists: TaskList[];
  workspaceLabels: WorkspaceLabel[];
}

export function BoardViews({ workspace, board, tasks, lists }: Props) {
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
  const [selectedLabels, setSelectedLabels] = useState<TaskLabel[]>([]);
  // Local per-session optimistic overrides (e.g., timeline resize) so switching views preserves changes
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, Partial<Task>>
  >({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Filter tasks based on selected labels
  const filteredTasks = useMemo(() => {
    if (selectedLabels.length === 0) {
      return tasks;
    }

    return tasks.filter((task) => {
      // If task has no labels, exclude it from results
      if (!task.labels || task.labels.length === 0) {
        return false;
      }

      // Check if task has any of the selected labels
      return selectedLabels.some((selectedLabel) =>
        task.labels?.some((taskLabel) => taskLabel.id === selectedLabel.id)
      );
    });
  }, [tasks, selectedLabels]);

  // Apply optimistic overrides so views receive up-to-date edits (durations, name, dates) even before refetch.
  const effectiveTasks = useMemo(() => {
    if (!Object.keys(taskOverrides).length) return filteredTasks;
    return filteredTasks.map((t) => {
      const o = taskOverrides[t.id];
      return o ? ({ ...t, ...o } as Task) : t;
    });
  }, [filteredTasks, taskOverrides]);

  const handleTaskPartialUpdate = (taskId: string, partial: Partial<Task>) => {
    setTaskOverrides((prev) => ({
      ...prev,
      [taskId]: { ...(prev[taskId] || {}), ...partial },
    }));
  };

  const handleUpdate = async () => {
    // Refresh both tasks and lists
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks', board.id] }),
      queryClient.invalidateQueries({ queryKey: ['task_lists', board.id] }),
    ]);
  };

  // Global keyboard shortcuts for all views
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // C to create a new task (in the first list)
      if (
        event.key.toLowerCase() === 'c' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !event.altKey &&
        !isInputField
      ) {
        event.preventDefault();
        event.stopPropagation();
        setCreateDialogOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const renderView = () => {
    switch (currentView) {
      case 'status-grouped':
        return (
          <StatusGroupedBoard
            lists={lists}
            tasks={effectiveTasks}
            boardId={board.id}
            onUpdate={handleUpdate}
            hideTasksMode={true}
            isPersonalWorkspace={workspace.personal}
          />
        );
      case 'kanban':
        return (
          <KanbanBoard
            workspace={workspace}
            boardId={board.id}
            tasks={effectiveTasks}
            lists={lists}
            isLoading={false}
          />
        );
      case 'list':
        return (
          <ListView
            boardId={board.id}
            tasks={effectiveTasks}
            lists={lists}
            isPersonalWorkspace={workspace.personal}
          />
        );
      case 'timeline':
        return (
          <TimelineBoard
            tasks={effectiveTasks}
            lists={lists}
            onTaskPartialUpdate={handleTaskPartialUpdate}
          />
        );
      default:
        return (
          <StatusGroupedBoard
            lists={lists}
            tasks={effectiveTasks}
            boardId={board.id}
            onUpdate={handleUpdate}
            hideTasksMode={true}
            isPersonalWorkspace={workspace.personal}
          />
        );
    }
  };

  return (
    <div className="-m-2 md:-mx-4 flex h-[calc(100vh-1rem)] flex-1 flex-col">
      <BoardHeader
        board={board}
        tasks={tasks}
        lists={lists}
        currentView={currentView}
        onViewChange={setCurrentView}
        selectedLabels={selectedLabels}
        onLabelsChange={setSelectedLabels}
      />
      <div className="h-full overflow-hidden">{renderView()}</div>

      {/* Global task creation dialog */}
      <TaskEditDialog
        boardId={board.id}
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onUpdate={handleUpdate}
        availableLists={lists}
      />
    </div>
  );
}
