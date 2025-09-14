'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types/db';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useMemo, useState } from 'react';
import { KanbanBoard } from '../boards/boardId/kanban';
import { StatusGroupedBoard } from '../boards/boardId/status-grouped-board';
import { TimelineBoard } from '../boards/boardId/timeline-board';
import { BoardHeader } from '../shared/board-header';
import { ListView } from '../shared/list-view';

interface TaskLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export type ViewType = 'kanban' | 'status-grouped' | 'list' | 'timeline';

interface Props {
  workspace: Workspace;
  board: TaskBoard & { tasks: Task[]; lists: TaskList[] };
}

export function BoardViews({ workspace, board }: Props) {
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
  const [selectedLabels, setSelectedLabels] = useState<TaskLabel[]>([]);
  // Local per-session optimistic overrides (e.g., timeline resize) so switching views preserves changes
  const [taskOverrides, setTaskOverrides] = useState<
    Record<string, Partial<Task>>
  >({});
  const queryClient = useQueryClient();

  // Filter tasks based on selected labels
  const filteredTasks = useMemo(() => {
    if (selectedLabels.length === 0) {
      return board.tasks;
    }

    return board.tasks.filter((task) => {
      // If task has no labels, exclude it from results
      if (!task.labels || task.labels.length === 0) {
        return false;
      }

      // Check if task has any of the selected labels
      return selectedLabels.some((selectedLabel) =>
        task.labels?.some((taskLabel) => taskLabel.id === selectedLabel.id)
      );
    });
  }, [board.tasks, selectedLabels]);

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

  // Helper function to create board with filtered tasks
  const createBoardWithTasks = (
    board: TaskBoard & { tasks: Task[]; lists: TaskList[] },
    tasks: Task[]
  ) =>
    ({
      ...board,
      tasks,
    }) as TaskBoard & { tasks: Task[]; lists: TaskList[] };

  const handleUpdate = async () => {
    // const supabase = createClient(); // Not needed for current implementation

    // Refresh both tasks and lists
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks', board.id] }),
      queryClient.invalidateQueries({ queryKey: ['task_lists', board.id] }),
    ]);
  };

  const renderView = () => {
    switch (currentView) {
      case 'status-grouped':
        return (
          <StatusGroupedBoard
            lists={board.lists}
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
            isLoading={false}
          />
        );
      case 'list':
        return (
          <ListView
            board={createBoardWithTasks(board, effectiveTasks)}
            isPersonalWorkspace={workspace.personal}
          />
        );
      case 'timeline':
        return (
          <TimelineBoard
            board={createBoardWithTasks(board, effectiveTasks)}
            onTaskPartialUpdate={handleTaskPartialUpdate}
          />
        );
      default:
        return (
          <StatusGroupedBoard
            lists={board.lists}
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
        currentView={currentView}
        onViewChange={setCurrentView}
        selectedLabels={selectedLabels}
        onLabelsChange={setSelectedLabels}
      />
      <div className="h-full flex-1 overflow-hidden">{renderView()}</div>
    </div>
  );
}
