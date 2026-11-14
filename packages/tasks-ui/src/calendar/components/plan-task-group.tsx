'use client';

import { ChevronDown } from '@tuturuuu/icons';
import type { ExtendedWorkspaceTask } from '@tuturuuu/ui/time-tracker/types';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  type PlanTaskHandlers,
  PlanTaskRow,
  type PlanTaskSchedule,
} from './plan-task-row';

/** Rows shown before a group asks to show the rest. */
export const PLAN_GROUP_ROW_CAP = 10;

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-dynamic-red',
  high: 'bg-dynamic-orange',
  normal: 'bg-dynamic-yellow',
  low: 'bg-dynamic-blue',
};

/**
 * One priority group: a plain header with the priority's name, a dot that
 * repeats it for assistive tech, and a capped list of compact rows.
 */
export function PlanTaskGroup({
  priority,
  label,
  tasks,
  collapsed,
  onToggle,
  scheduleFor,
  handlers,
  now,
}: {
  priority: string;
  label: string;
  tasks: ExtendedWorkspaceTask[];
  collapsed: boolean;
  onToggle: () => void;
  scheduleFor: (task: ExtendedWorkspaceTask) => PlanTaskSchedule;
  handlers: PlanTaskHandlers;
  now: Date;
}) {
  const t = useTranslations('calendar.plan_panel');
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? tasks : tasks.slice(0, PLAN_GROUP_ROW_CAP);
  const hidden = tasks.length - visible.length;
  const listId = `plan-group-${priority}`;

  return (
    <section aria-label={label}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-controls={listId}
        className="flex h-7 w-full items-center gap-1.5 rounded-md px-1 text-left text-muted-foreground text-xs hover:bg-muted/60 hover:text-foreground"
      >
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 transition-transform',
            collapsed && '-rotate-90'
          )}
        />
        <span
          role="img"
          aria-label={label}
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            PRIORITY_DOT[priority]
          )}
        />
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums">{tasks.length}</span>
      </button>
      {!collapsed && (
        <div id={listId} role="list" className="mt-0.5 space-y-px">
          {visible.map((task) => (
            <PlanTaskRow
              key={task.id}
              task={task}
              schedule={scheduleFor(task)}
              handlers={handlers}
              now={now}
            />
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="h-7 w-full rounded-md px-1.5 text-left text-muted-foreground text-xs hover:bg-muted/60 hover:text-foreground"
            >
              {t('show_more', { count: hidden })}
            </button>
          )}
          {tasks.length === 0 && (
            <p className="px-1.5 py-1 text-muted-foreground text-xs">
              {t('no_tasks')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
