'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types/db';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useState } from 'react';
import { KanbanBoard } from '../boards/boardId/kanban';
import { StatusGroupedBoard } from '../boards/boardId/status-grouped-board';
import { BoardHeader } from '../shared/board-header';
import { ListView } from '../shared/list-view';

export type ViewType = 'kanban' | 'status-grouped' | 'list';

interface Props {
  workspace: Workspace;
  board: TaskBoard & { tasks: Task[]; lists: TaskList[] };
}

export function BoardViews({ workspace, board }: Props) {
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
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
            tasks={board.tasks}
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
            tasks={board.tasks}
            isLoading={false}
          />
        );
      case 'list':
        return (
          <ListView
            board={createBoardWithFilteredTasks(board, board.tasks)}
            isPersonalWorkspace={workspace.personal}
          />
        );
      default:
        return (
          <StatusGroupedBoard
            lists={board.lists}
            tasks={board.tasks}
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
      />
      <div className="h-full flex-1 overflow-hidden">{renderView()}</div>
    </div>
  );
}
