'use client';

import { KanbanBoard } from '../kanban';
import { StatusGroupedBoard } from '../status-grouped-board';
import { BoardHeader } from './board-header';
import { BoardSummary } from './board-summary';
import { ListView } from './list-view';
import { useQueryClient } from '@tanstack/react-query';
import {
  Task,
  TaskBoard,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';
import { useState } from 'react';

type ViewType = 'status-grouped' | 'kanban' | 'list';

interface Props {
  board: TaskBoard & { tasks: Task[]; lists: TaskList[] };
}

export function BoardViews({ board }: Props) {
  const [currentView, setCurrentView] = useState<ViewType>('status-grouped');
  const queryClient = useQueryClient();

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
            tasks={board.tasks}
            boardId={board.id}
            onUpdate={handleUpdate}
            hideTasksMode={true}
          />
        );
      case 'kanban':
        return (
          <KanbanBoard
            boardId={board.id}
            tasks={board.tasks}
            isLoading={false}
          />
        );
      case 'list':
        return <ListView board={board} />;
      default:
        return (
          <StatusGroupedBoard
            lists={board.lists}
            tasks={board.tasks}
            boardId={board.id}
            onUpdate={handleUpdate}
            hideTasksMode={true}
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
      <BoardSummary board={board} />
      <div className="flex-1 overflow-hidden">{renderView()}</div>
    </div>
  );
}
