'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types/db';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { KanbanBoard } from '@tuturuuu/ui/tuDo/boards/boardId/kanban';
import { StatusGroupedBoard } from '@tuturuuu/ui/tuDo/boards/boardId/status-grouped-board';
import { BoardHeader } from '@tuturuuu/ui/tuDo/shared/board-header';
import { BoardSummary } from '@tuturuuu/ui/tuDo/shared/board-summary';
import { ListView } from '@tuturuuu/ui/tuDo/shared/list-view';
import { useMemo, useState } from 'react';

export type ViewType = 'kanban' | 'status-grouped' | 'list';

interface Props {
  workspace: Workspace;
  board: TaskBoard & { tasks: Task[]; lists: TaskList[] };
}

export function BoardViews({ workspace, board }: Props) {
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(true); // Start collapsed
  const queryClient = useQueryClient();

  // Helper function to create board with filtered tasks
  const createBoardWithFilteredTasks = (
    board: TaskBoard & { tasks: Task[]; lists: TaskList[] },
    filteredTasks: Task[]
  ) =>
    ({
      ...board,
      tasks: filteredTasks,
    }) as TaskBoard & { tasks: Task[]; lists: TaskList[] };

  // Filter tasks based on selected tags
  const filteredTasks = useMemo(() => {
    if (selectedTags.length === 0) {
      return board.tasks;
    }

    return board.tasks.filter((task) => {
      if (!task.tags || task.tags.length === 0) {
        return false;
      }

      // Check if task has any of the selected tags
      return selectedTags.some((selectedTag) =>
        task.tags?.includes(selectedTag)
      );
    });
  }, [board.tasks, selectedTags]);

  const handleUpdate = async () => {
    // const supabase = createClient(); // Not needed for current implementation

    // Refresh both tasks and lists
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tasks', board.id] }),
      queryClient.invalidateQueries({ queryKey: ['task-lists', board.id] }),
    ]);
  };

  const renderView = () => {
    switch (currentView) {
      case 'status-grouped':
        return (
          <StatusGroupedBoard
            lists={board.lists}
            tasks={filteredTasks}
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
            tasks={filteredTasks}
            isLoading={false}
          />
        );
      case 'list':
        return (
          <ListView
            board={createBoardWithFilteredTasks(board, filteredTasks)}
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
            isPersonalWorkspace={workspace.personal}
          />
        );
      default:
        return (
          <StatusGroupedBoard
            lists={board.lists}
            tasks={filteredTasks}
            boardId={board.id}
            onUpdate={handleUpdate}
            hideTasksMode={true}
            isPersonalWorkspace={workspace.personal}
          />
        );
    }
  };

  return (
    <div className="flex h-full flex-col">
      <BoardHeader
        board={board}
        currentView={currentView}
        onViewChange={setCurrentView}
      />
      <BoardSummary
        board={createBoardWithFilteredTasks(board, filteredTasks)}
        collapsed={isSummaryCollapsed}
        onToggleCollapsed={() => setIsSummaryCollapsed(!isSummaryCollapsed)}
      />
      <div className="flex-1 overflow-hidden">{renderView()}</div>
    </div>
  );
}
