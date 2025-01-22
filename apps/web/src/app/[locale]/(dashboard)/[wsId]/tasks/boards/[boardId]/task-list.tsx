import { ListActions } from './list-actions';
import { Task, TaskCard } from './task';
import { TaskForm } from './task-form';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import { cn } from '@repo/ui/lib/utils';
import { GripVertical } from 'lucide-react';

export interface Column {
  id: string;
  title: string;
}

interface Props {
  column: Column;
  tasks: Task[];
  isOverlay?: boolean;
  onTaskCreated?: () => void;
  onListUpdated?: () => void;
}

export function BoardColumn({
  column,
  tasks,
  isOverlay,
  onTaskCreated,
  onListUpdated,
}: Props) {
  console.log('Rendering board column:', {
    columnId: column.id,
    columnTitle: column.title,
    tasksCount: tasks.length,
    tasks: tasks.map((t) => ({ id: t.id, list_id: t.list_id })),
  });

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
        id: String(column.id), // Ensure column id is a string
      },
    },
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
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
        'flex h-full w-[350px] flex-col rounded-lg',
        isDragging && 'opacity-50',
        isOverlay && 'cursor-grabbing'
      )}
    >
      <div className="flex items-center gap-2 border-b p-3">
        <Button
          variant={'ghost'}
          {...attributes}
          {...listeners}
          className="-ml-2 h-auto cursor-grab p-1"
        >
          <span className="sr-only">Move list</span>
          <GripVertical className="h-4 w-4" />
        </Button>
        <h3 className="font-medium">{column.title}</h3>
        <span className="text-muted-foreground ml-auto text-sm">
          {tasks.length} tasks
        </span>
        <ListActions
          listId={column.id}
          listName={column.title}
          onUpdate={handleUpdate}
        />
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
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
