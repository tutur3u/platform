'use client';

import { CalendarDays, KanbanSquare, ListChecks } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { getTaskTicketLabel } from '@tuturuuu/utils/task-helper';
import { isTaskOverdueByOwnDate } from '@tuturuuu/utils/task-helper/sprints';
import { useLocale, useTranslations } from 'next-intl';
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
  // The shared Tabs, sized to the header's h-8 controls.
  return (
    <Tabs onValueChange={(value) => onTabChange(value as BoardTab)} value={tab}>
      <TabsList aria-label={t('tabs_label')} className="h-8 p-0.5">
        <TabsTrigger className="h-7 px-2.5 text-xs" value="plan">
          <ListChecks className="size-3.5" />
          {t('plan_tab')}
        </TabsTrigger>
        <TabsTrigger className="h-7 px-2.5 text-xs" value="board">
          <KanbanSquare className="size-3.5" />
          {t('board_tab')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/** "[PLA-12] Title" from the task's first project; no prefix without a project. */
export function PlanTaskTitle({
  className,
  task,
}: {
  className?: string;
  task: Task;
}) {
  const id = getTaskTicketLabel(task);
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
