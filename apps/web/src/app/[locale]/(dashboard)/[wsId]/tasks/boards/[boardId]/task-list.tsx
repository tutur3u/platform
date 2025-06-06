import { ListActions } from './list-actions';
import { Task, TaskCard } from './task';
import { TaskForm } from './task-form';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { GripVertical } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';

export interface Column {
  id: string;
  title: string;
}

interface Props {
  column: Column;
  boardId: string;
  tasks: Task[];
  isOverlay?: boolean;
  onTaskCreated?: () => void;
  onListUpdated?: () => void;
}

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

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex h-full w-[350px] flex-col rounded-lg transition-colors',
        'touch-none select-none',
        isDragging && 'scale-[1.02] rotate-2 opacity-90 shadow-lg',
        isOverlay && 'shadow-lg'
      )}
    >
      <div className="flex items-center gap-2 border-b p-3">
        <div
          {...attributes}
          {...listeners}
          className={cn(
            '-ml-2 h-auto cursor-grab p-1 opacity-50 transition-opacity',
            'group-hover:opacity-100',
            isDragging && 'opacity-100',
            isOverlay && 'cursor-grabbing'
          )}
        >
          <span className="sr-only">Move list</span>
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="flex flex-1 items-center gap-2">
          <h3 className="text-sm font-medium">{column.title}</h3>
          <Badge variant="secondary" className="text-xs font-normal">
            {tasks.length}
          </Badge>
        </div>
        <ListActions
          listId={column.id}
          listName={column.title}
          onUpdate={handleUpdate}
        />
      </div>
      <style jsx global>{`
        :root {
          --task-height: auto;
        }
      `}</style>
      <div className="flex-1 space-y-2.5 overflow-y-auto p-2">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            boardId={boardId}
            onUpdate={handleUpdate}
          />
        ))}
      </div>
      <div className="border-t p-2">
        <TaskForm listId={column.id} onTaskCreated={handleTaskCreated} />
      </div>
    </Card>
  );
}

export function BoardContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full gap-4 overflow-x-auto p-4">
      {children}
    </div>
  );
}
