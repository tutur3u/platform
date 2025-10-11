'use client';

import { MoreHorizontal } from '@tuturuuu/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';

interface ActionsDropdownProps {
  taskId: string;
  onEdit?: (taskId: string) => void;
  onViewDetails?: (taskId: string) => void;
  onDueDate?: (taskId: string) => void;
  onAddTime?: (taskId: string) => void;
  onLogWork?: (taskId: string) => void;
  onMarkDone?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
}

export default function ActionsDropdown({
  taskId,
  onEdit,
  onViewDetails,
  onDueDate,
  onAddTime,
  onLogWork,
  onMarkDone,
  onDelete,
}: ActionsDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded p-1 hover:bg-accent/30"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onEdit?.(taskId)}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onViewDetails?.(taskId)}>
          View details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDueDate?.(taskId)}>
          Due date
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAddTime?.(taskId)}>
          Add time
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onLogWork?.(taskId)}>
          Log work
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onMarkDone?.(taskId)}>
          Mark done
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onDelete?.(taskId)}
          className="text-red-600"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
