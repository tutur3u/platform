import { ListActions } from './list-actions';
import { statusIcons } from './status-section';
import { Task, TaskCard } from './task';
import { TaskForm } from './task-form';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { TaskList } from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { GripVertical } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';

export interface Column extends TaskList {
  // This extends TaskList to include color, status, position
}

interface Props {
  column: Column;
  boardId: string;
  tasks: Task[];
  isOverlay?: boolean;
  onTaskCreated?: () => void;
  onListUpdated?: () => void;
}

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

export function BoardColumn({
  column,
  boardId,
  tasks,
  isOverlay,
  onTaskCreated,
  onListUpdated,
}: Props) {
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
    if (onListUpdated) onListUpdated();
    else if (onTaskCreated) onTaskCreated();
  };

  const handleTaskCreated = () => {
    if (onTaskCreated) onTaskCreated();
  };

  const colorClass =
    colorClasses[column.color as SupportedColor] || colorClasses.GRAY;
  const statusIcon = statusIcons[column.status];

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex h-full w-[350px] flex-col rounded-xl transition-all duration-200',
        'touch-none border-l-4 select-none',
        colorClass,
        isDragging &&
          'scale-[1.02] rotate-1 opacity-90 shadow-xl ring-2 ring-primary/20',
        isOverlay && 'shadow-2xl ring-2 ring-primary/30',
        'hover:shadow-md'
      )}
    >
      <div className="flex items-center gap-2 rounded-t-xl border-b p-3">
        <div
          {...attributes}
          {...listeners}
          className={cn(
            '-ml-2 h-auto cursor-grab p-1 opacity-40 transition-all',
            'group-hover:opacity-70 hover:bg-black/5',
            isDragging && 'opacity-100',
            isOverlay && 'cursor-grabbing'
          )}
        >
          <span className="sr-only">Move list</span>
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="flex flex-1 items-center gap-2">
          <span className="text-sm">{statusIcon}</span>
          <h3 className="text-sm font-semibold text-foreground/90">
            {column.name}
          </h3>
          <Badge
            variant="secondary"
            className={cn(
              'px-2 py-0.5 text-xs font-medium',
              tasks.length === 0 ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {tasks.length}
          </Badge>
        </div>
        <ListActions
          listId={column.id}
          listName={column.name}
          onUpdate={handleUpdate}
        />
      </div>

      <div className="max-h-[32rem] flex-1 space-y-2 overflow-y-auto p-3">
        {tasks.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <p className="text-sm">No tasks yet</p>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              taskList={column}
              boardId={boardId}
              onUpdate={handleUpdate}
            />
          ))
        )}
      </div>

      <div className="border-t p-3 backdrop-blur-sm">
        <TaskForm listId={column.id} onTaskCreated={handleTaskCreated} />
      </div>
    </Card>
  );
}

export function BoardContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="scrollbar-none flex h-full w-full gap-4 overflow-x-auto pb-6">
      {children}
    </div>
  );
}
