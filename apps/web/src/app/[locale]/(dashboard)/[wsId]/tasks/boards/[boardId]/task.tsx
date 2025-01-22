import { Task as TaskType } from '@/types/primitives/TaskBoard';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@repo/ui/components/ui/card';
import { cn } from '@repo/ui/lib/utils';

export interface Task extends TaskType {}

interface Props {
  task: Task;
  isOverlay?: boolean;
}

export function TaskCard({ task, isOverlay }: Props) {
  console.log('Rendering task card:', {
    taskId: task.id,
    listId: task.list_id,
    taskData: task,
  });

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'Task',
      task: {
        ...task,
        list_id: String(task.list_id), // Ensure list_id is a string
      },
    },
  });

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex h-[90px] cursor-grab flex-col gap-2 rounded-lg border p-3 text-left text-sm',
        isDragging && 'opacity-50',
        isOverlay && 'cursor-grabbing'
      )}
      {...attributes}
      {...listeners}
    >
      <p className="line-clamp-2 flex-grow text-sm font-medium">{task.name}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {task.priority && (
            <span className="text-muted-foreground text-xs">
              Priority: {task.priority}
            </span>
          )}
        </div>
        {task.end_date && (
          <span className="text-muted-foreground text-xs">
            Due: {new Date(task.end_date).toLocaleDateString()}
          </span>
        )}
      </div>
    </Card>
  );
}
