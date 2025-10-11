'use client';

import { Flag } from '@tuturuuu/icons';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import type { TASK_PRIORITIES } from './priority-view';

interface PriorityDropdownProps {
  taskId: string;
  currentPriority?: string;
  allPriorities: typeof TASK_PRIORITIES;
  onPriorityChange: (taskId: string, newPriority: string) => void;
}

export default function PriorityDropdown({
  taskId,
  currentPriority = 'normal',
  allPriorities,
  onPriorityChange,
}: PriorityDropdownProps) {
  const textColor =
    allPriorities?.[currentPriority as keyof typeof allPriorities]?.textColor ||
    'text-muted-foreground';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ml-1 rounded p-1 hover:bg-accent/30"
          aria-label="Edit priority"
        >
          <Flag className={`h-4 w-4 ${textColor}`} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {Object.entries(allPriorities).map(([key, priority]) => (
          <DropdownMenuItem
            key={key}
            onClick={() => onPriorityChange(taskId, key)}
          >
            {priority.emoji} {priority.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
