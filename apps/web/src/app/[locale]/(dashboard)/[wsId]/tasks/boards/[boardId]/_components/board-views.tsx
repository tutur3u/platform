'use client';

import { useQueryClient } from '@tanstack/react-query';
import type {
  Task,
  TaskBoard,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';
import { useMemo, useState } from 'react';
import { KanbanBoard } from '../kanban';
import { StatusGroupedBoard } from '../status-grouped-board';
import { BoardHeader } from './board-header';
import { BoardSummary } from './board-summary';
import { ListView } from './list-view';

type ViewType = 'kanban' | 'status-grouped' | 'list';

interface Props {
  board: TaskBoard & { tasks: Task[]; lists: TaskList[] };
}

export function BoardViews({ board }: Props) {
  const [currentView, setCurrentView] = useState<ViewType>('kanban');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const queryClient = useQueryClient();

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
      return selectedTags.some(
        (selectedTag) => task.tags?.includes(selectedTag) ?? false
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
          />
        );
      case 'kanban':
        return (
          <KanbanBoard
            boardId={board.id}
            tasks={filteredTasks}
            isLoading={false}
          />
        );
      case 'list':
        return (
          <ListView
            board={
              { ...board, tasks: filteredTasks } as TaskBoard & {
                tasks: Task[];
                lists: TaskList[];
              }
            }
            selectedTags={selectedTags}
            onTagsChange={setSelectedTags}
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
        board={
          { ...board, tasks: filteredTasks } as TaskBoard & {
            tasks: Task[];
            lists: TaskList[];
          }
        }
      />
      <div className="flex-1 overflow-hidden">{renderView()}</div>
    </div>
  );
}
