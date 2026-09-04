'use client';

import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
} from '@tuturuuu/icons';
import { CommandItem } from '@tuturuuu/ui/command';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { TaskCommandResult } from './use-task-command-data';

const PRIORITY_ICON = {
  critical: AlertTriangle,
  high: ArrowUp,
  normal: ArrowRight,
  low: ArrowDown,
} as const;

export function TaskCommandItem({
  busy,
  onOpen,
  onToggleComplete,
  task,
}: {
  busy: boolean;
  onOpen: () => void;
  onToggleComplete: () => void;
  task: TaskCommandResult;
}) {
  const t = useTranslations('command_palette');
  const PriorityIcon = task.priority ? PRIORITY_ICON[task.priority] : null;
  const overdue = Boolean(
    task.end_date && !task.completed && new Date(task.end_date) < new Date()
  );

  return (
    <CommandItem
      className="group mx-1 my-0.5 min-h-14 gap-3 rounded-xl border border-transparent px-2.5 py-2 data-[selected=true]:border-border data-[selected=true]:bg-accent/70"
      onSelect={onOpen}
      value={`task-${task.id}-${task.name}-${task.board_name ?? ''}-${task.list_name ?? ''}`}
    >
      <button
        aria-label={
          task.completed
            ? t('task_actions.mark_open')
            : t('task_actions.mark_complete')
        }
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        disabled={busy}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleComplete();
        }}
        onPointerDown={(event) => event.preventDefault()}
        type="button"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : task.completed ? (
          <CheckCircle2 className="size-5 text-primary" />
        ) : (
          <Circle className="size-5" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate font-medium text-sm',
            task.completed && 'text-muted-foreground line-through'
          )}
        >
          {task.name}
        </p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {task.board_name ? (
            <span className="max-w-56 truncate">
              {task.board_name}
              {task.list_name ? ` / ${task.list_name}` : ''}
            </span>
          ) : null}
          {PriorityIcon && task.priority ? (
            <span className="flex items-center gap-1">
              <PriorityIcon className="size-3" />
              {t(`priority.${task.priority}`)}
            </span>
          ) : null}
          {task.end_date ? (
            <span
              className={cn(
                'flex items-center gap-1',
                overdue && 'font-medium text-destructive'
              )}
            >
              <Clock className="size-3" />
              {formatTaskDate(task.end_date)}
            </span>
          ) : null}
        </div>
      </div>
      <kbd className="hidden rounded border bg-background px-1.5 py-1 font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-data-[selected=true]:opacity-100 sm:block">
        ↵
      </kbd>
    </CommandItem>
  );
}

function formatTaskDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}
