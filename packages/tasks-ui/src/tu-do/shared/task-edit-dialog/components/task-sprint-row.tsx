'use client';

import { CalendarDays, ChevronDown, Flag } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import {
  DropdownMenu,
  DropdownMenuContent,
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
import { SprintMoveItems } from '../../board-sprints/sprint-move-items';
import {
  NEW_SPRINT,
  type SprintMoveTarget,
  useBoardSprintMutations,
  useBoardSprints,
} from '../../board-sprints/use-board-sprints';
import { TaskPropertyRow } from '../task-property-row';

/**
 * The task's sprint in the task panel: which open sprint it is in, the sprint
 * end as its due date when it has none of its own, its sprint history, and a
 * menu to move it on to the next sprint or out of its sprint. Hidden with sprints off
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
  const openSprints = sprints.sprints.filter(isBoardSprintOpen);
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
  // null takes the task out of every sprint, into Plan's backlog.
  const moveTo = (target: SprintMoveTarget) => {
    // The move swaps this item out of the menu, so close first.
    setMenuOpen(false);
    requestAnimationFrame(() =>
      moveTasks.mutate(
        {
          sprintId: target === NEW_SPRINT ? NEW_SPRINT : (target?.id ?? null),
          taskIds: [task.id],
        },
        {
          onSuccess: (data) => {
            const name = target === NEW_SPRINT ? data.sprintName : target?.name;
            toast.success(
              name ? t('moved_to_sprint', { name }) : t('moved_out_of_sprints')
            );
          },
          onError: () => toast.error(t('move_failed')),
        }
      )
    );
  };

  return (
    <section
      aria-label={t('sprint_field')}
      className="mb-2 border-b pb-2 text-sm"
    >
      <TaskPropertyRow icon={Flag} label={t('sprint_field')}>
        {canEdit ? (
          <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className="-ml-2 inline-flex h-8 min-w-0 max-w-full items-center gap-1.5 rounded-md px-2 text-left font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
                // One move at a time, so a later pick cannot finish first.
                disabled={moveTasks.isPending}
                type="button"
              >
                <span className="truncate">{label}</span>
                <ChevronDown className="size-3 shrink-0 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <SprintMoveItems
                current={current}
                onMove={moveTo}
                openSprints={openSprints}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="block truncate font-medium leading-8">{label}</span>
        )}
        {due?.source === 'sprint' ? (
          <p className="flex items-center gap-1 pt-1 text-muted-foreground text-xs">
            <CalendarDays className="size-3" />
            {t('due_with_sprint', { date: formatDay(due.date) })}
          </p>
        ) : null}
        {history.length > 1 ? (
          <p className="pt-0.5 text-muted-foreground text-xs">
            {t('sprint_history', {
              list: history.map((sprint) => sprint.sequence_number).join(', '),
            })}
          </p>
        ) : null}
      </TaskPropertyRow>
    </section>
  );
}
