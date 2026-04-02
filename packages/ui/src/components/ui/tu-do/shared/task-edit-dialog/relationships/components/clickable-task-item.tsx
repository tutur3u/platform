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
import { formatRelationshipTaskIdentifier } from '../../../relationship-task-identifier';
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
  const taskIdentifier = formatRelationshipTaskIdentifier(task);

  return (
    <div className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-linear-to-r from-background via-background to-muted/20 p-3 transition-all hover:border-border hover:shadow-sm">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onNavigateToTask(task.id)}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
            >
              <div
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-background',
                  task.completed ? 'bg-dynamic-green' : 'bg-muted-foreground/30'
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    'truncate font-medium text-sm transition-colors group-hover:text-primary',
                    task.completed && 'text-muted-foreground line-through'
                  )}
                >
                  {task.name}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                  {taskIdentifier && (
                    <span className="w-fit rounded-full border border-border/70 bg-muted/35 px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none">
                      {taskIdentifier}
                    </span>
                  )}
                  {task.board_name && (
                    <span className="truncate">{task.board_name}</span>
                  )}
                </div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
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
