'use client';

import { useQueryClient } from '@tanstack/react-query';
import type {
  Task,
  TaskBoard,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';
import { useState } from 'react';
import { ModernTaskList } from '@/components/tasks/modern-task-list';
import { CalendarView } from '@/components/tasks/calendar-view';
import { AnalyticsView } from '@/components/tasks/analytics-view';
import { useTasks } from '@/hooks/use-tasks';
import { KanbanBoard } from '../kanban';
import { StatusGroupedBoard } from '../status-grouped-board';
import { BoardHeader } from './board-header';
import { BoardSummary } from './board-summary';
import { ListView } from './list-view';

// Add new view types
type ViewType = 'status-grouped' | 'kanban' | 'list' | 'modern-list' | 'calendar' | 'analytics';

interface Props {
  board: TaskBoard & { tasks: Task[]; lists: TaskList[] };
}

export function BoardViews({ board }: Props) {
  const [currentView, setCurrentView] = useState<ViewType>('modern-list'); // Default to modern list
  const queryClient = useQueryClient();

  // Initialize the modern task management hook
  const { handleTaskAction, handleBulkAction } = useTasks(board.tasks);

  const handleUpdate = async () => {
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
      case 'modern-list':
        return (
          <div className="p-6">
            <ModernTaskList
              tasks={board.tasks}
              loading={false}
              onTaskAction={handleTaskAction}
              onBulkAction={handleBulkAction}
              className="max-w-none"
            />
          </div>
        );
      case 'calendar':
        return (
          <CalendarView
            tasks={board.tasks}
            onTaskSelect={(taskId) => console.log('Calendar task selected:', taskId)}
            className="h-full"
          />
        );
      case 'analytics':
        return (
          <AnalyticsView
            tasks={board.tasks}
            className="h-full overflow-auto"
          />
        );
      default:
        return (
          <div className="p-6">
            <ModernTaskList
              tasks={board.tasks}
              loading={false}
              onTaskAction={handleTaskAction}
              onBulkAction={handleBulkAction}
              className="max-w-none"
            />
          </div>
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
