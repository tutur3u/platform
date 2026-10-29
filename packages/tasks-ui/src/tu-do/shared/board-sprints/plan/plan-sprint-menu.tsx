'use client';

import { CalendarRange } from '@tuturuuu/icons';
import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Moves one task to any open sprint, or out of every sprint. */
export function PlanSprintMenu({
  className,
  current,
  disabled,
  onMove,
  openSprints,
  task,
}: {
  className?: string;
  /** The open sprint holding the task; null while it sits in none. */
  current: BoardSprint | null;
  /** One move at a time, so a later pick cannot finish first. */
  disabled?: boolean;
  onMove: (sprintId: string | null) => void;
  openSprints: BoardSprint[];
  task: Task;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const targets = openSprints.filter((sprint) => sprint.id !== current?.id);
  const [open, setOpen] = useState(false);
  // The move swaps the picked item out of the menu, so close first.
  const move = (sprintId: string | null) => {
    setOpen(false);
    requestAnimationFrame(() => onMove(sprintId));
  };

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('sprint_menu', { name: task.name })}
          className={cn(
            'relative z-10 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
            className
          )}
          disabled={disabled}
          type="button"
        >
          <CalendarRange className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          {current?.name ?? t('not_in_sprint')}
        </DropdownMenuLabel>
        {targets.map((sprint) => (
          <DropdownMenuItem key={sprint.id} onSelect={() => move(sprint.id)}>
            {t('move_to_sprint', { name: sprint.name })}
          </DropdownMenuItem>
        ))}
        {current ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => move(null)}>
              {t('no_sprint')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
