'use client';

import { CalendarDays, Ellipsis, Flag, Play } from '@tuturuuu/icons';
import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import {
  formatSprintDateRange,
  isBoardSprintOpen,
} from '@tuturuuu/utils/task-helper/sprints';
import { useLocale, useTranslations } from 'next-intl';
import { type DragEvent, type ReactNode, useState } from 'react';
import { ToneButton } from '../../board-header/tone-button';
import {
  MemberAvatar,
  PlanOwnDueDate,
  PlanTaskTitle,
  writePlanDrag,
} from './plan-parts';
import type { PlanOwner } from './use-sprint-plan-data';

/** The sprint picker, dates, the one sprint action, and the goal. */
export function PlanSprintHeader({
  activeSprint,
  canManage,
  canPlan,
  isNext,
  onEndActive,
  onSaveGoal,
  onStart,
  picker,
  sprint,
  starting,
}: {
  activeSprint: BoardSprint | null;
  canManage: boolean;
  canPlan: boolean;
  /** The shown sprint is the next one to start. */
  isNext: boolean;
  onEndActive?: () => void;
  onSaveGoal: (goal: string) => void;
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
    <div className="flex flex-col gap-2">
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
          <Button
            className="h-8"
            disabled={starting}
            onClick={onStart}
            size="sm"
          >
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
      {sprint ? (
        <SprintGoalInput
          disabled={!canPlan || !isBoardSprintOpen(sprint)}
          key={`${sprint.id}:${sprint.goal ?? ''}`}
          onSave={onSaveGoal}
          value={sprint.goal ?? ''}
        />
      ) : null}
    </div>
  );
}

function SprintGoalInput({
  disabled,
  onSave,
  value,
}: {
  disabled: boolean;
  onSave: (goal: string) => void;
  value: string;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft.trim() !== value.trim()) onSave(draft.trim());
  };

  return (
    <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-2 text-sm focus-within:ring-2 focus-within:ring-ring">
      <Flag className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        aria-label={t('goal')}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        disabled={disabled}
        maxLength={280}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setDraft(value);
        }}
        placeholder={t('goal_placeholder')}
        value={draft}
      />
    </label>
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
  sprintTag: (task: Task) => string | null;
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
        <Badge className="px-2 py-0.5 font-medium text-xs" variant="secondary">
          {tasks.length}
        </Badge>
      </div>
      {tasks.map((task) => (
        <div
          className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
          draggable={canEdit}
          key={task.id}
          onDragEnd={onDragEnd}
          onDragStart={(event) => writePlanDrag(event, task.id, member.id)}
        >
          <PlanTaskTitle className="flex-1 text-sm" task={task} />
          {sprintTag(task) ? (
            <span className="whitespace-nowrap rounded-md border border-dashed px-1.5 text-muted-foreground text-xs">
              {sprintTag(task)}
            </span>
          ) : null}
          <span className="whitespace-nowrap text-muted-foreground text-xs">
            {listsById.get(task.list_id)?.name}
          </span>
          <PlanOwnDueDate task={task} />
          {renderSprintMenu?.(task)}
          <button
            aria-label={t('open_task', { name: task.name })}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
            onClick={() => onOpen(task)}
            type="button"
          >
            <Ellipsis className="size-3.5" />
          </button>
        </div>
      ))}
      {tasks.length === 0 ? (
        <p className="px-2 py-1 text-muted-foreground text-xs">
          {t('owner_empty')}
        </p>
      ) : null}
    </section>
  );
}
