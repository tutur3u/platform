import { ColumnId } from './kanban';
import type { UniqueIdentifier } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import { Card, CardContent, CardHeader } from '@repo/ui/components/ui/card';
import { cva } from 'class-variance-authority';
import { GripVertical } from 'lucide-react';

export interface Task {
  id: UniqueIdentifier;
  columnId: ColumnId;
  content: string;
}

interface TaskCardProps {
  task: Task;
  isOverlay?: boolean;
}

export type TaskType = 'Task';

export interface TaskDragData {
  type: TaskType;
  task: Task;
}

export function TaskCard({ task, isOverlay }: TaskCardProps) {
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
      task,
    } satisfies TaskDragData,
    attributes: {
      roleDescription: 'Task',
    },
  });

  const style = {
    transition,
    transform: CSS.Translate.toString(transform),
  };

  const variants = cva('', {
    variants: {
      dragging: {
        over: 'ring-2 opacity-30',
        overlay: 'ring-2 ring-primary',
      },
    },
  });

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? 'overlay' : isDragging ? 'over' : undefined,
      })}
    >
      <CardHeader className="space-between border-secondary relative flex flex-row border-b-2 px-3 py-3">
        <Button
          variant={'ghost'}
          {...attributes}
          {...listeners}
          className="text-secondary-foreground/50 -ml-2 h-auto cursor-grab p-1"
        >
          <span className="sr-only">Move task</span>
          <GripVertical />
        </Button>
        <Badge variant={'outline'} className="ml-auto font-semibold">
          Task
        </Badge>
      </CardHeader>
      <CardContent className="whitespace-pre-wrap px-3 pb-6 pt-3 text-left">
        {task.content}
      </CardContent>
    </Card>
  );
}
