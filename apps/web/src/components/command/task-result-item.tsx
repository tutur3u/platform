'use client';

import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  Loader2,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { CommandItem } from '@tuturuuu/ui/command';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getTasksAppUrlClient } from '@/lib/tasks-app-url-client';
import { isTaskDueSoon, isTaskOverdue } from './utils/command-task-results';
import type { TaskSearchResult } from './utils/use-task-search';

dayjs.extend(relativeTime);

const PRIORITY_ICON = {
  critical: AlertTriangle,
  high: ArrowUp,
  normal: ArrowRight,
  low: ArrowDown,
} as const;

interface TaskResultItemProps {
  busy: boolean;
  now: Date;
  onOpen: (task: TaskSearchResult) => void;
  onToggleComplete: (task: TaskSearchResult) => void;
  task: TaskSearchResult;
  wsId: string;
}

export function TaskResultItem({
  busy,
  now,
  onOpen,
  onToggleComplete,
  task,
  wsId,
}: TaskResultItemProps) {
  const t = useTranslations('command_palette');
  const overdue = isTaskOverdue(task, now);
  const dueSoon = isTaskDueSoon(task, now);
  const PriorityIcon = task.priority ? PRIORITY_ICON[task.priority] : null;

  const copyTaskLink = async () => {
    try {
      const url = getTasksAppUrlClient(`/${wsId}/tasks/${task.id}`);
      await navigator.clipboard.writeText(url);
      toast.success(t('task_actions.link_copied'));
    } catch {
      toast.error(t('task_actions.link_copy_failed'));
    }
  };

  return (
    <CommandItem
      value={`task-${task.id}-${task.name}-${task.board_name ?? ''}-${task.list_name ?? ''}`}
      onSelect={() => onOpen(task)}
      className="group mx-1 my-0.5 items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 data-[selected=true]:border-border data-[selected=true]:bg-accent/70"
    >
      <button
        type="button"
        disabled={busy}
        aria-label={
          task.completed
            ? t('task_actions.mark_open')
            : t('task_actions.mark_complete')
        }
        onPointerDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleComplete(task);
        }}
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : task.completed ? (
          <CheckCircle2 className="size-5 text-primary" />
        ) : (
          <Circle className="size-5" />
        )}
      </button>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'truncate font-medium text-sm',
              task.completed && 'text-muted-foreground line-through'
            )}
          >
            {task.name}
          </span>
          {task.is_assigned_to_current_user ? (
            <Badge variant="outline" className="shrink-0 px-1.5 text-[10px]">
              {t('assigned_to_you')}
            </Badge>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
          {task.board_name ? (
            <span className="max-w-48 truncate">
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
                overdue && 'font-medium text-destructive',
                dueSoon && 'font-medium text-primary'
              )}
            >
              <Clock className="size-3" />
              {overdue
                ? t('overdue')
                : t('task_actions.due', {
                    date: dayjs(task.end_date).fromNow(),
                  })}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 group-data-[selected=true]:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('task_actions.copy_link')}
          className="size-7"
          onPointerDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void copyTaskLink();
          }}
        >
          <Copy className="size-3.5" />
        </Button>
        <span className="hidden items-center gap-1 rounded border bg-background px-1.5 py-1 font-mono text-[10px] text-muted-foreground sm:flex">
          <Check className="size-3" />
          {t('keyboard_hints.open')}
        </span>
      </div>
    </CommandItem>
  );
}
