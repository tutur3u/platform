'use client';

import { CalendarDays, ChevronDown, Flag } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import {
  formatSprintDateRange,
  getTaskEffectiveDueDate,
  getTaskSprintHistory,
  isBoardSprintOpen,
} from '@tuturuuu/utils/task-helper/sprints';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  useBoardSprintMutations,
  useBoardSprints,
} from '../../board-sprints/use-board-sprints';

/**
 * The task's sprint in the task panel: which open sprint it is in, the sprint
 * end as its due date when it has none of its own, its sprint history, and a
 * menu to move it to the running or planned sprint. Hidden with sprints off
 * and for tasks not saved yet. `endDate` is the due date being edited.
 */
export function TaskSprintRow({
  boardId,
  canEdit,
  endDate,
  task,
  wsId,
}: {
  boardId: string;
  canEdit: boolean;
  endDate: Date | undefined;
  task?: Task;
  wsId: string;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const locale = useLocale();
  const sprints = useBoardSprints({
    boardId,
    enabled: Boolean(task?.id && boardId),
    wsId,
  });
  const { moveTasks } = useBoardSprintMutations({ boardId, wsId });
  const [menuOpen, setMenuOpen] = useState(false);

  if (!task?.id || !sprints.sprintsOn) return null;

  const current = sprints.openSprintByTaskId.get(task.id) ?? null;
  const due = getTaskEffectiveDueDate(
    { end_date: endDate?.toISOString() ?? null },
    current
  );
  const history = getTaskSprintHistory(sprints.sprints, task.id);
  const targets = sprints.sprints.filter(
    (sprint) => isBoardSprintOpen(sprint) && sprint.id !== current?.id
  );
  const formatDay = (value: string) =>
    new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));

  const label = current
    ? `${current.name} · ${formatSprintDateRange(current, locale)}`
    : t('not_in_sprint');

  return (
    <section
      aria-label={t('sprint_field')}
      className="flex flex-col gap-1 border-b px-4 py-3 text-sm"
    >
      <div className="flex items-center gap-2">
        <Flag className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="w-20 shrink-0 text-muted-foreground text-xs">
          {t('sprint_field')}
        </span>
        {canEdit && targets.length ? (
          <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
                // One move at a time, so a later pick cannot finish first.
                disabled={moveTasks.isPending}
                type="button"
              >
                <span className="truncate">{label}</span>
                <ChevronDown className="size-3 shrink-0 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {targets.map((sprint) => (
                <DropdownMenuItem
                  key={sprint.id}
                  onSelect={() => {
                    // The move swaps this item out of the menu, so close first.
                    setMenuOpen(false);
                    requestAnimationFrame(() =>
                      moveTasks.mutate(
                        { sprintId: sprint.id, taskIds: [task.id] },
                        {
                          onSuccess: () =>
                            toast.success(
                              t('moved_to_sprint', { name: sprint.name })
                            ),
                          onError: () => toast.error(t('move_failed')),
                        }
                      )
                    );
                  }}
                >
                  {t('move_to_sprint', { name: sprint.name })}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="truncate px-1.5">{label}</span>
        )}
      </div>
      {due?.source === 'sprint' ? (
        <p className="flex items-center gap-1 pl-[6.5rem] text-muted-foreground text-xs">
          <CalendarDays className="size-3" />
          {t('due_with_sprint', { date: formatDay(due.date) })}
        </p>
      ) : null}
      {history.length > 1 ? (
        <p className="pl-[6.5rem] text-muted-foreground text-xs">
          {t('sprint_history', {
            list: history.map((sprint) => sprint.sequence_number).join(', '),
          })}
        </p>
      ) : null}
    </section>
  );
}
