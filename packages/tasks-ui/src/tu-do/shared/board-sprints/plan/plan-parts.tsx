'use client';

import { CalendarDays, KanbanSquare, ListChecks } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { cn } from '@tuturuuu/utils/format';
import { getTicketIdentifier } from '@tuturuuu/utils/task-helper';
import { isTaskOverdueByOwnDate } from '@tuturuuu/utils/task-helper/sprints';
import { useLocale, useTranslations } from 'next-intl';
import { ToneButton } from '../../board-header/tone-button';
import type { BoardMember } from '../../board-members-query';

export type BoardTab = 'plan' | 'board';

/** Plan | Board, the first control of the second header row on sprint boards. */
export function BoardPlanTabs({
  onTabChange,
  tab,
}: {
  onTabChange: (tab: BoardTab) => void;
  tab: BoardTab;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  return (
    <div
      aria-label={t('tabs_label')}
      className="inline-flex items-center gap-1"
      role="tablist"
    >
      <ToneButton
        active={tab === 'plan'}
        aria-selected={tab === 'plan'}
        onClick={() => onTabChange('plan')}
        role="tab"
        tone="green"
      >
        <ListChecks />
        {t('plan_tab')}
      </ToneButton>
      <ToneButton
        active={tab === 'board'}
        aria-selected={tab === 'board'}
        onClick={() => onTabChange('board')}
        role="tab"
        tone="blue"
      >
        <KanbanSquare />
        {t('board_tab')}
      </ToneButton>
    </div>
  );
}

/** "[DEV-248] Title", the ID in the same color as the title. */
export function PlanTaskTitle({
  className,
  task,
  ticketPrefix,
}: {
  className?: string;
  task: Task;
  ticketPrefix?: string | null;
}) {
  const prefix =
    (task as Task & { ticket_prefix?: string | null }).ticket_prefix ??
    ticketPrefix;
  const id =
    typeof task.display_number === 'number' && task.display_number > 0
      ? getTicketIdentifier(prefix, task.display_number)
      : null;
  return (
    <span className={cn('min-w-0 break-words', className)}>
      {id ? (
        <span className="mr-1 whitespace-nowrap font-mono">[{id}]</span>
      ) : null}
      {task.name}
    </span>
  );
}

export function MemberAvatar({
  className,
  member,
}: {
  className?: string;
  member: Pick<BoardMember, 'avatar_url' | 'display_name'>;
}) {
  return (
    <Avatar className={cn('size-6', className)}>
      {member.avatar_url ? (
        <AvatarImage alt="" src={member.avatar_url} />
      ) : null}
      <AvatarFallback className="text-xs">
        {(member.display_name ?? '?').charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** A task's own due date; sprint ends are implied and not repeated per task. */
export function PlanOwnDueDate({ task }: { task: Task }) {
  const locale = useLocale();
  if (!task.end_date) return null;
  const overdue = isTaskOverdueByOwnDate(task);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground text-xs',
        overdue && 'text-dynamic-red'
      )}
    >
      <CalendarDays className="size-3" />
      {new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
      }).format(new Date(task.end_date))}
    </span>
  );
}

/** Drag payload shared by backlog cards and owner rows. */
const PLAN_DRAG_TYPE = 'application/x-tuturuuu-plan-task';

export function writePlanDrag(
  event: React.DragEvent,
  taskId: string,
  from: string | null
) {
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(PLAN_DRAG_TYPE, JSON.stringify({ from, taskId }));
}

export function readPlanDrag(
  event: React.DragEvent
): { from: string | null; taskId: string } | null {
  try {
    const raw = event.dataTransfer.getData(PLAN_DRAG_TYPE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { from?: unknown; taskId?: unknown };
    if (typeof parsed.taskId !== 'string') return null;
    return {
      from: typeof parsed.from === 'string' ? parsed.from : null,
      taskId: parsed.taskId,
    };
  } catch {
    return null;
  }
}

export function isPlanDrag(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types).includes(PLAN_DRAG_TYPE);
}
