'use client';

import { ExternalLink, Loader2, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import type { ClickableTaskItemProps } from '../types/task-relationships.types';

export function ClickableTaskItem({
  task,
  onNavigateToTask,
  onRemove,
  isSaving,
  isRemoving,
  showRemove = true,
  disabled = false,
}: ClickableTaskItemProps) {
  return (
    <div className="group flex items-center justify-between gap-2 rounded-lg border bg-background p-2.5 transition-colors hover:bg-muted/50">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onNavigateToTask(task.id)}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
            >
              <div
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  task.completed ? 'bg-dynamic-green' : 'bg-muted-foreground/30'
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    'truncate text-sm transition-colors group-hover:text-primary',
                    task.completed && 'text-muted-foreground line-through'
                  )}
                >
                  {task.name}
                </span>
                <span className="text-muted-foreground text-xs">
                  {task.board_name}{' '}
                  {typeof task.display_number === 'number' &&
                    ` #${task.display_number}`}
                </span>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Click to open this task</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {showRemove && onRemove && !disabled && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={isSaving}
        >
          {isRemoving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
    </div>
  );
}
