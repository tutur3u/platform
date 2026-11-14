'use client';

import { Check, Circle } from '@tuturuuu/icons';
import type { ExtendedWorkspaceTask } from '@tuturuuu/ui/time-tracker/types';
import { cn } from '@tuturuuu/utils/format';
import type { DragEvent, KeyboardEvent } from 'react';
import ActionsDropdown from './actions-dropdown';
import PriorityDropdown from './priority-dropdown';

export interface PlanTaskSchedule {
  totalMinutes: number;
  scheduledMinutes: number;
  loading: boolean;
}

export interface PlanTaskHandlers {
  onOpen: (taskId: string) => void;
  onEdit: (taskId: string) => void;
  onScheduling: (taskId: string) => void;
  onStartDateChange: (taskId: string, date: Date | null) => void;
  onDueDateChange: (taskId: string, date: Date | null) => void;
  onMarkDone: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onPriorityChange: (taskId: string, priority: string) => void;
  onDragStart: (
    event: DragEvent<HTMLDivElement>,
    task: ExtendedWorkspaceTask
  ) => void;
  onDragEnd: (event: DragEvent<HTMLDivElement>) => void;
}

export function formatPlanDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function dueLabel(date: string | Date) {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isOverdue(date: string | Date, now: Date) {
  const due = new Date(date);
  due.setHours(23, 59, 59, 999);
  return due.getTime() < now.getTime();
}

/**
 * One task in the plan panel: a single line that keyboard users reach with
 * Tab, open with Enter and mark done with Space. Dragging onto the grid
 * schedules it; the actions menu's "schedule" entry is the keyboard path.
 */
export function PlanTaskRow({
  task,
  schedule,
  handlers,
  now,
}: {
  task: ExtendedWorkspaceTask;
  schedule: PlanTaskSchedule;
  handlers: PlanTaskHandlers;
  now: Date;
}) {
  const isCompleted = !!task.closed_at;
  const name = task.name || 'Untitled task';
  const hasSchedule = schedule.totalMinutes > 0;
  const fullyScheduled =
    hasSchedule && schedule.scheduledMinutes >= schedule.totalMinutes;
  const overdue =
    !isCompleted && !!task.due_date && isOverdue(task.due_date, now);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      handlers.onOpen(task.id);
    } else if (event.key === ' ') {
      event.preventDefault();
      if (!isCompleted) handlers.onMarkDone(task.id);
    }
  };

  return (
    <div
      role="listitem"
      tabIndex={0}
      aria-label={name}
      draggable={!isCompleted}
      onDragStart={(event) => handlers.onDragStart(event, task)}
      onDragEnd={handlers.onDragEnd}
      onClick={() => handlers.onOpen(task.id)}
      onKeyDown={onKeyDown}
      className={cn(
        'group/task flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring',
        isCompleted
          ? 'text-muted-foreground'
          : 'cursor-grab active:cursor-grabbing'
      )}
    >
      <button
        type="button"
        aria-label={isCompleted ? 'Completed' : 'Mark done'}
        disabled={isCompleted}
        onClick={(event) => {
          event.stopPropagation();
          handlers.onMarkDone(task.id);
        }}
        className="flex size-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-100"
      >
        {isCompleted ? (
          <Check className="size-3.5" />
        ) : (
          <Circle className="size-3.5" />
        )}
      </button>
      <span
        className={cn('min-w-0 flex-1 truncate', isCompleted && 'line-through')}
      >
        {name}
      </span>
      {hasSchedule && (
        <span
          className={cn(
            'shrink-0 text-xs tabular-nums',
            fullyScheduled ? 'text-dynamic-green' : 'text-muted-foreground'
          )}
        >
          {formatPlanDuration(schedule.scheduledMinutes)}/
          {formatPlanDuration(schedule.totalMinutes)}
        </span>
      )}
      {task.due_date && (
        <span
          className={cn(
            'shrink-0 text-xs tabular-nums',
            overdue ? 'text-dynamic-red' : 'text-muted-foreground'
          )}
        >
          {dueLabel(task.due_date)}
        </span>
      )}
      <div
        className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/task:opacity-100 group-focus-visible/task:opacity-100"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <ActionsDropdown
          taskId={task.id}
          taskName={name}
          startDate={task.start_date}
          endDate={task.end_date}
          onEdit={handlers.onEdit}
          onScheduling={handlers.onScheduling}
          onStartDateChange={handlers.onStartDateChange}
          onDueDateChange={handlers.onDueDateChange}
          onMarkDone={handlers.onMarkDone}
          onDelete={handlers.onDelete}
        />
        <PriorityDropdown
          taskId={task.id}
          currentPriority={task.priority || 'normal'}
          onPriorityChange={handlers.onPriorityChange}
        />
      </div>
    </div>
  );
}
