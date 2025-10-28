import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from '@tuturuuu/icons';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { useParams } from 'next/navigation';
import React, { useMemo } from 'react';
import { useTaskDialog } from '../../hooks/useTaskDialog';
import { ListActions } from './list-actions';
import { statusIcons } from './status-section';
import type { TaskFilters } from './task-filter';
import { VirtualizedTaskList } from './task-list';

// Color mappings for visual consistency
const colorClasses: Record<SupportedColor, string> = {
  GRAY: 'border-l-dynamic-gray/50 bg-dynamic-gray/5',
  RED: 'border-l-dynamic-red/50 bg-dynamic-red/5',
  BLUE: 'border-l-dynamic-blue/50 bg-dynamic-blue/5',
  GREEN: 'border-l-dynamic-green/50 bg-dynamic-green/5',
  YELLOW: 'border-l-dynamic-yellow/50 bg-dynamic-yellow/5',
  ORANGE: 'border-l-dynamic-orange/50 bg-dynamic-orange/5',
  PURPLE: 'border-l-dynamic-purple/50 bg-dynamic-purple/5',
  PINK: 'border-l-dynamic-pink/50 bg-dynamic-pink/5',
  INDIGO: 'border-l-dynamic-indigo/50 bg-dynamic-indigo/5',
  CYAN: 'border-l-dynamic-cyan/50 bg-dynamic-cyan/5',
};

interface BoardColumnProps {
  column: TaskList;
  boardId: string;
  tasks: Task[];
  isOverlay?: boolean;
  onUpdate?: () => void;
  selectedTasks?: Set<string>;
  isMultiSelectMode?: boolean;
  isPersonalWorkspace?: boolean;
  onTaskSelect?: (taskId: string, event: React.MouseEvent) => void;
  onClearSelection?: () => void;
  onAddTask?: (list: TaskList) => void;
  dragPreviewPosition?: {
    listId: string;
    overTaskId: string | null;
    position: 'before' | 'after' | 'empty';
    task: Task;
    height: number;
  } | null;
  taskHeightsRef?: React.MutableRefObject<Map<string, number>>;
  optimisticUpdateInProgress?: Set<string>;
  filters?: TaskFilters;
}

function BoardColumnInner({
  column,
  boardId,
  tasks,
  isOverlay,
  onUpdate,
  selectedTasks,
  onTaskSelect,
  onClearSelection,
  isMultiSelectMode,
  isPersonalWorkspace,
  onAddTask,
  dragPreviewPosition,
  taskHeightsRef,
  optimisticUpdateInProgress,
  filters,
}: BoardColumnProps) {
  const params = useParams();
  const wsId = params.wsId as string;
  const { createTask } = useTaskDialog();

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: {
      type: 'Column',
      column: {
        ...column,
        id: String(column.id),
      },
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleUpdate = () => {
    onUpdate?.();
  };

  const colorClass =
    colorClasses[column.color as SupportedColor] || colorClasses.GRAY;
  const statusIcon = statusIcons[column.status];

  // Memoize drag handle for performance
  const DragHandle = useMemo(
    () => (
      <div
        {...attributes}
        {...listeners}
        className={cn(
          '-ml-2 h-auto cursor-grab p-1 opacity-40 transition-all',
          'hover:bg-black/5 group-hover:opacity-70',
          isDragging && 'opacity-100',
          isOverlay && 'cursor-grabbing'
        )}
        title="Drag to move list"
      >
        <span className="sr-only">Move list</span>
        <GripVertical className="h-4 w-4" />
      </div>
    ),
    [attributes, listeners, isDragging, isOverlay]
  );

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex h-full w-[350px] flex-col rounded-xl transition-all duration-200',
        'touch-none select-none',
        colorClass,
        isDragging &&
          'rotate-1 scale-[1.02] opacity-90 shadow-xl ring-2 ring-primary/20',
        isOverlay && 'shadow-2xl ring-2 ring-primary/30',
        'hover:shadow-md',
        // Visual feedback for invalid drop (dev only)
        DEV_MODE && isDragging && !isOverlay && 'ring-2 ring-red-400/60',
        'border-0'
      )}
    >
      <div className="flex items-center gap-2 rounded-t-xl border-b p-3">
        {DragHandle}
        <div className="flex flex-1 items-center gap-2">
          <span className="text-sm">{statusIcon}</span>
          <h3 className="font-semibold text-foreground/90 text-sm">
            {column.name}
          </h3>
          <Badge
            variant="secondary"
            className={cn(
              'px-2 py-0.5 font-medium text-xs',
              tasks.length === 0 ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {tasks.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <ListActions
            listId={column.id}
            listName={column.name}
            listStatus={column.status}
            tasks={tasks}
            boardId={boardId}
            wsId={wsId}
            onUpdate={handleUpdate}
            onSelectAll={
              onTaskSelect && tasks.length > 0
                ? () => {
                    // Select all tasks in this list
                    tasks.forEach((task) => {
                      // Simulate shift+click to add to selection
                      const fakeEvent = {
                        shiftKey: true,
                        ctrlKey: false,
                        metaKey: false,
                        preventDefault: () => {},
                        stopPropagation: () => {},
                      } as React.MouseEvent;
                      onTaskSelect(task.id, fakeEvent);
                    });
                  }
                : undefined
            }
          />
        </div>
      </div>

      {/* Virtualized Tasks Container */}
      <VirtualizedTaskList
        tasks={tasks}
        column={column}
        boardId={boardId}
        onUpdate={handleUpdate}
        isMultiSelectMode={isMultiSelectMode}
        selectedTasks={selectedTasks}
        isPersonalWorkspace={isPersonalWorkspace}
        onTaskSelect={onTaskSelect}
        onClearSelection={onClearSelection}
        dragPreviewPosition={dragPreviewPosition}
        taskHeightsRef={taskHeightsRef}
        optimisticUpdateInProgress={optimisticUpdateInProgress}
      />

      <div className="rounded-b-xl border-t p-3 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onAddTask
              ? onAddTask(column)
              : createTask(boardId, column.id, [column], filters)
          }
          className="w-full justify-start rounded-lg border border-dynamic-gray/40 border-dashed text-muted-foreground text-xs transition-all hover:border-dynamic-gray/60 hover:bg-muted/40 hover:text-foreground"
        >
          + Add task
        </Button>
      </div>
    </Card>
  );
}

export const BoardColumn = React.memo(BoardColumnInner);
