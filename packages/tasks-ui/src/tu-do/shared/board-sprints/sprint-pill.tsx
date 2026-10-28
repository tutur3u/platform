'use client';

import {
  CalendarDays,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  Flag,
  Play,
  Settings,
} from '@tuturuuu/icons';
import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { formatSprintDateRange } from '@tuturuuu/utils/task-helper/sprints';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ToneButton } from '../board-header/tone-button';

export interface SprintProgress {
  done: number;
  total: number;
}

/** Ring that fills with the share of finished tasks. */
export function SprintRing({ ratio }: { ratio: number }) {
  const percent = Math.round(Math.min(Math.max(ratio, 0), 1) * 100);
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3.5 shrink-0 rounded-full"
      style={{
        background: `conic-gradient(currentColor ${percent}%, color-mix(in oklab, currentColor 20%, transparent) 0)`,
        mask: 'radial-gradient(circle, transparent 3px, #000 3.5px)',
        WebkitMask: 'radial-gradient(circle, transparent 3px, #000 3.5px)',
      }}
    />
  );
}

/**
 * Breadcrumb pill for the board's sprint, with a switcher listing every sprint
 * in order and the one sprint action for managers.
 */
export function SprintPill({
  canManage,
  currentSprint,
  getProgress,
  onEndSprint,
  onOpenSettings,
  onSelectSprint,
  onStartSprint,
  sprints,
  starting,
}: {
  canManage: boolean;
  currentSprint: BoardSprint;
  getProgress: (sprint: BoardSprint) => SprintProgress;
  onEndSprint?: (sprint: BoardSprint) => void;
  onOpenSettings?: () => void;
  onSelectSprint?: (sprint: BoardSprint) => void;
  onStartSprint?: (sprint: BoardSprint) => void;
  sprints: BoardSprint[];
  starting?: boolean;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  // Actions open dialogs or settings, so the menu closes first.
  const closeThen = (action: () => void) => () => {
    setOpen(false);
    // Let the menu finish closing before a dialog takes focus.
    requestAnimationFrame(action);
  };
  const isActive = currentSprint.status === 'active';
  const progress = getProgress(currentSprint);
  const ordered = [...sprints]
    .filter((sprint) => sprint.status !== 'cancelled')
    .sort((a, b) => a.sequence_number - b.sequence_number);
  const activeSprint = sprints.find((sprint) => sprint.status === 'active');
  const hasActive = Boolean(activeSprint);
  const endable = onEndSprint ? activeSprint : undefined;
  const startable = !hasActive
    ? sprints.find((sprint) => sprint.status === 'planned')
    : undefined;

  const rowRight = (sprint: BoardSprint) => {
    if (sprint.status === 'completed') {
      return sprint.report
        ? t('done_count', {
            done: sprint.report.done_tasks,
            total: sprint.report.total_tasks,
          })
        : '';
    }
    if (sprint.status === 'active') {
      const value = getProgress(sprint);
      return t('done_count', { done: value.done, total: value.total });
    }
    return t('task_count', { count: sprint.tasks.length });
  };

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('switcher_label', { name: currentSprint.name })}
          className="inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 text-foreground text-sm transition-colors hover:bg-muted"
          type="button"
        >
          <span className="text-dynamic-green">
            <SprintRing
              ratio={progress.total ? progress.done / progress.total : 0}
            />
          </span>
          <span className="font-medium">{currentSprint.name}</span>
          <span className="@3xl/board-header:inline-flex hidden h-6 items-center gap-1 rounded-md bg-muted px-2 font-normal text-muted-foreground text-xs">
            <CalendarDays className="size-3" />
            {formatSprintDateRange(currentSprint, locale)}
          </span>
          <span className="@md/board-header:inline hidden font-normal text-muted-foreground">
            {isActive
              ? t('done_count', { done: progress.done, total: progress.total })
              : t('task_count', { count: progress.total })}
          </span>
          <ChevronDown className="size-3.5 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-[min(24rem,calc(100vw-2rem))]"
      >
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          {t('sprints')}
        </DropdownMenuLabel>
        {ordered.map((sprint) => {
          const isCurrent = sprint.id === currentSprint.id;
          const value = getProgress(sprint);
          return (
            <DropdownMenuItem
              key={sprint.id}
              className={cn(
                'items-center gap-3 py-2',
                isCurrent && 'bg-dynamic-green/10'
              )}
              onSelect={closeThen(() => onSelectSprint?.(sprint))}
            >
              <span className="grid w-4 place-items-center text-muted-foreground">
                {sprint.status === 'active' ? (
                  <span className="text-dynamic-green">
                    <SprintRing
                      ratio={value.total ? value.done / value.total : 0}
                    />
                  </span>
                ) : sprint.status === 'completed' ? (
                  <CircleCheck className="size-3.5" />
                ) : (
                  <CircleDashed className="size-3.5" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{sprint.name}</span>
                  {sprint.status === 'active' ? (
                    <span className="rounded-md bg-dynamic-green/10 px-1.5 text-dynamic-green text-xs">
                      {t('active')}
                    </span>
                  ) : sprint.status === 'planned' ? (
                    <span className="rounded-md bg-muted px-1.5 text-muted-foreground text-xs">
                      {t('next')}
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground text-xs">
                  {formatSprintDateRange(sprint, locale)}
                </span>
              </span>
              <span
                className={cn(
                  'whitespace-nowrap text-muted-foreground text-xs',
                  sprint.status === 'active' && 'font-medium text-dynamic-green'
                )}
              >
                {rowRight(sprint)}
              </span>
            </DropdownMenuItem>
          );
        })}
        {canManage && (startable || endable || onOpenSettings) ? (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center gap-2 p-1">
              {endable && onEndSprint ? (
                <ToneButton
                  onClick={closeThen(() => onEndSprint(endable))}
                  tone="green"
                >
                  <Flag />
                  {t('end_sprint', { name: endable.name })}
                </ToneButton>
              ) : null}
              {startable && onStartSprint ? (
                <ToneButton
                  disabled={starting}
                  onClick={closeThen(() => onStartSprint(startable))}
                  tone="green"
                >
                  <Play />
                  {t('start', { name: startable.name })}
                </ToneButton>
              ) : null}
              <span className="flex-1" />
              {onOpenSettings ? (
                <button
                  className="inline-flex h-7 items-center gap-2 rounded-md px-2 font-medium text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
                  onClick={closeThen(onOpenSettings)}
                  type="button"
                >
                  <Settings className="size-3.5" />
                  {t('sprint_length')}
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
