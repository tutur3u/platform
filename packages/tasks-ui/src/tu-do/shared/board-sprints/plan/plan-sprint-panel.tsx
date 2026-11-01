'use client';

import { CalendarDays, Flag, Play } from '@tuturuuu/icons';
import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { formatSprintDateRange } from '@tuturuuu/utils/task-helper/sprints';
import { useLocale, useTranslations } from 'next-intl';
import type { DragEvent, ReactNode } from 'react';
import { ToneButton } from '../../board-header/tone-button';
import { SprintLabel } from '../sprint-label';
import {
  MemberAvatar,
  PlanOwnDueDate,
  PlanTaskTitle,
  writePlanDrag,
} from './plan-parts';
import type { PlanOwner } from './use-sprint-plan-data';

/** The sprint picker, dates, and the one sprint action. */
export function PlanSprintHeader({
  activeSprint,
  canManage,
  isNext,
  onEndActive,
  onStart,
  picker,
  sprint,
  starting,
}: {
  activeSprint: BoardSprint | null;
  canManage: boolean;
  /** The shown sprint is the next one to start. */
  isNext: boolean;
  onEndActive?: () => void;
  onStart: () => void;
  picker: ReactNode;
  /** null while every sprint shows at once. */
  sprint: BoardSprint | null;
  starting: boolean;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const locale = useLocale();
  const showsActive = Boolean(activeSprint && sprint?.id === activeSprint.id);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {picker}
      {sprint ? (
        <span className="inline-flex h-6 items-center gap-1 rounded-md bg-muted px-2 text-muted-foreground text-xs">
          <CalendarDays className="size-3" />
          {formatSprintDateRange(sprint, locale)}
        </span>
      ) : null}
      <span className="flex-1" />
      {canManage && !activeSprint && isNext && sprint ? (
        <Button className="h-8" disabled={starting} onClick={onStart} size="sm">
          <Play />
          {t('start', { name: sprint.name })}
        </Button>
      ) : null}
      {canManage && activeSprint && onEndActive && (isNext || showsActive) ? (
        <ToneButton onClick={onEndActive} tone="green">
          <Flag />
          {showsActive
            ? t('end_sprint', { name: activeSprint.name })
            : t('end_first', { name: activeSprint.name })}
        </ToneButton>
      ) : null}
    </div>
  );
}

/** One person's share of the sprint; a drop target for backlog tasks. */
export function PlanOwnerSection({
  canEdit,
  dropActive,
  listsById,
  onDragEnd,
  onDragOver,
  onDrop,
  onOpen,
  owner,
  renderSprintMenu,
  sprintTag,
}: {
  canEdit: boolean;
  dropActive: boolean;
  listsById: Map<string, TaskList>;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onOpen: (task: Task) => void;
  owner: PlanOwner;
  renderSprintMenu?: (task: Task) => ReactNode;
  /** The task's sprint, when several sprints show at once. */
  sprintTag: (task: Task) => BoardSprint | null;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const { member, tasks } = owner;

  return (
    <section
      aria-label={member.display_name}
      className={cn(
        'rounded-lg border bg-background/50 p-2 transition-shadow',
        dropActive && 'border-dynamic-green/60 ring-2 ring-dynamic-green/30'
      )}
      data-plan-owner-id={member.id}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-2 px-1 pb-1">
        <MemberAvatar member={member} />
        <span className="truncate font-medium text-sm">
          {member.display_name}
        </span>
      </div>
      {tasks.map((task) => (
        <div
          className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
          draggable={canEdit}
          key={task.id}
          onDragEnd={onDragEnd}
          onDragStart={(event) => writePlanDrag(event, task.id, member.id)}
        >
          <button
            aria-label={t('open_task', { name: task.name })}
            className="min-w-0 flex-1 cursor-pointer text-left"
            onClick={() => onOpen(task)}
            type="button"
          >
            <PlanTaskTitle className="text-sm" task={task} />
          </button>
          <SprintLabel chip sprint={sprintTag(task)} />
          <span className="whitespace-nowrap text-muted-foreground text-xs">
            {listsById.get(task.list_id)?.name}
          </span>
          <PlanOwnDueDate task={task} />
          {renderSprintMenu?.(task)}
        </div>
      ))}
    </section>
  );
}
