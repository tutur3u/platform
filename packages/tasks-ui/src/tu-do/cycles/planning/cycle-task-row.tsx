'use client';

import { MoreHorizontal } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';
import { taskTicket } from './cycle-planning-model';
import { CYCLE_TASK_DRAG_TYPE } from './cycle-scope-switcher';
import type { CyclePlanningScope, CyclePlanningTask } from './types';

interface CycleTaskRowProps {
  task: CyclePlanningTask;
  href: string;
  moveTargets: readonly CyclePlanningScope[];
  onMove: (task: CyclePlanningTask, target: CyclePlanningScope) => void;
}

/** Arrow keys move focus to the previous or next row in the list. */
function moveRowFocus(event: KeyboardEvent<HTMLAnchorElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const list = event.currentTarget.closest('[data-cycle-list]');
  if (!list) return;
  const rows = [...list.querySelectorAll<HTMLElement>('[data-cycle-row]')];
  const index = rows.indexOf(event.currentTarget);
  const next = rows[index + (event.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

/** One dense line: ticket, title, project chip, assignees, move menu. */
export function CycleTaskRow({
  task,
  href,
  moveTargets,
  onMove,
}: CycleTaskRowProps) {
  const t = useTranslations('task-cycle-planning');
  const project = task.projects[0];

  return (
    <li className="group flex h-8 items-center gap-2 rounded-md px-2 hover:bg-muted/60 has-[:focus-visible]:bg-muted/60">
      <span className="w-20 shrink-0 truncate font-mono text-muted-foreground text-xs">
        {taskTicket(task)}
      </span>
      <Link
        href={href}
        data-cycle-row
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData(CYCLE_TASK_DRAG_TYPE, task.id);
          event.dataTransfer.effectAllowed = 'move';
        }}
        onKeyDown={moveRowFocus}
        className="min-w-0 flex-1 truncate text-sm outline-none"
      >
        {task.name}
      </Link>
      {project && (
        <span className="max-w-32 shrink-0 truncate rounded border px-1.5 text-muted-foreground text-xs">
          {project.name}
        </span>
      )}
      <div className="flex shrink-0 -space-x-1.5">
        {task.assignees.slice(0, 2).map((person) => (
          <Avatar
            key={person.id}
            className="size-5 border border-background"
            title={person.display_name ?? undefined}
          >
            {person.avatar_url && <AvatarImage src={person.avatar_url} />}
            <AvatarFallback className="text-[10px]">
              {(person.display_name ?? '?').slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      {moveTargets.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('task_actions')}
              className="size-6 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {moveTargets.map((target) => (
              <DropdownMenuItem
                key={target}
                onSelect={() => onMove(task, target)}
              >
                {t(`move_to_${target}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
