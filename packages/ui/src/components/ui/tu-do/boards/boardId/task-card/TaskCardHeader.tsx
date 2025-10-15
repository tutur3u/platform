import { MoreHorizontal } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { memo } from 'react';
import { AssigneeSelect } from '../../../shared/assignee-select';

interface TaskCardHeaderProps {
  task: Task;
  isPersonalWorkspace?: boolean;
  menuOpen: boolean;
  isMobile: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  children: React.ReactNode; // For menu content
}

export const TaskCardHeader = memo(function TaskCardHeader({
  task,
  isPersonalWorkspace = false,
  menuOpen,
  isMobile,
  onMenuOpenChange,
  onUpdate,
  children,
}: TaskCardHeaderProps) {
  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <button
            type="button"
            className={cn(
              'w-full cursor-pointer text-left font-semibold text-xs leading-tight transition-colors duration-200',
              'line-clamp-2',
              task.closed_at
                ? 'text-muted-foreground line-through'
                : '-mx-1 -my-0.5 rounded-sm px-1 py-0.5 text-foreground active:bg-muted/50'
            )}
            aria-label={`Edit task: ${task.name}`}
            title="Click to edit task"
          >
            {task.name}
          </button>
        </div>
      </div>

      {/* Actions menu */}
      <div className="flex items-center justify-end gap-1">
        <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className={cn(
                'h-7 w-7 shrink-0 p-0 transition-all duration-200',
                'hover:scale-105 hover:bg-muted',
                menuOpen || isMobile
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100',
                menuOpen && 'bg-muted ring-1 ring-border'
              )}
            >
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56"
            sideOffset={5}
            onClick={(e) => {
              e.stopPropagation(); // Prevent triggering task card click
            }}
          >
            {children}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Assignee */}
      {!isPersonalWorkspace && (
        <div className="flex flex-none items-start justify-start">
          <AssigneeSelect
            taskId={task.id}
            assignees={task.assignees}
            onUpdate={onUpdate}
          />
        </div>
      )}
    </div>
  );
});
