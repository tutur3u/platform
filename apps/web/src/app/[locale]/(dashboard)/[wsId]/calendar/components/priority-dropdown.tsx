'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Flag } from '@tuturuuu/ui/icons';

interface PriorityDropdownProps {
  taskId: string;
  currentPriority?: string;
  onPriorityChange: (taskId: string, newPriority: string) => void;
}

export default function PriorityDropdown({
  taskId,
  currentPriority = 'normal',
  onPriorityChange,
}: PriorityDropdownProps) {
  const priorityColors = {
    low: 'text-green-600',
    normal: 'text-blue-600',
    high: 'text-orange-600',
    critical: 'text-red-600',
  };

  const currentColor =
    priorityColors[currentPriority as keyof typeof priorityColors] ||
    'text-muted-foreground';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ml-1 rounded p-1 hover:bg-accent/30"
          aria-label="Edit priority"
        >
          <Flag className={`h-4 w-4 ${currentColor}`} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onPriorityChange(taskId, 'critical')}>
          😡 Critical
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPriorityChange(taskId, 'high')}>
          😠 High
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPriorityChange(taskId, 'normal')}>
          😐 Normal
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onPriorityChange(taskId, 'low')}>
          😊 Low
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
